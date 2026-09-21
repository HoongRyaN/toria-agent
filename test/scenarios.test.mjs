import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createTriageService } from '../triage.mjs';

const image = 'data:image/png;base64,' + readFileSync(new URL('../public/demo/vpn.png', import.meta.url)).toString('base64');
test('truncated output preserves finish reason and cost while rejecting missing tool calls', async () => {
  const service = createTriageService({ config: () => ({ key: 'sk-orca-TEST', model: 'test' }), fetchFn: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'sensitive debug text' } }], usage: { cost_usd: 0.0001 } })) });
  const s = await service.handle({ action: 'start', text: '急ぎの業務が止まっています', requestId: randomUUID() });
  assert.equal(s.currentCheck.mode, 'fallback'); assert.equal(s.latestRequest.finishReason, 'length');
  assert.equal(s.latestRequest.fallbackReason, 'invalid_tool'); assert.equal(s.latestRequest.costUsd, 0.0001);
  assert.ok(!JSON.stringify(s).includes('sensitive debug text'));
});
async function scenario(vision = { screen: 'vpn', state: 'connected' }) {
  const service = createTriageService({ config: () => ({ key: 'sk-orca-TEST', model: 'test' }), fetchFn: async (_, options) => {
    const request = JSON.parse(options.body), name = request.tools[0].function.name;
    if (name === 'inspect_check_image' && vision === 'outage') throw new Error('offline');
    const ids = name === 'select_next_check' ? JSON.parse(request.messages[1].content).allowed_checks.map(c => c.id) : [];
    const args = name === 'inspect_check_image' ? vision : { check_id: ['location', 'public_web', 'vpn', 'error_screen', 'impact'].find(id => ids.includes(id)) };
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }] }));
  } });
  let s = await service.handle({ action: 'start', text: '在宅で社内サイトが開かない', requestId: randomUUID() });
  const act = async body => s = await service.handle({ sessionId: s.id, revision: s.revision, requestId: randomUUID(), ...body });
  await act({ action: 'answer', checkId: 'location', value: 'remote' });
  await act({ action: 'answer', checkId: 'public_web', value: 'yes' });
  return { act, state: () => s };
}
test('image and employee disagreement preserves both and hands off without deciding who is right', async () => {
  const x = await scenario();
  await x.act({ action: 'image', checkId: 'vpn', image });
  const calls = x.state().calls.length;
  const s = await x.act({ action: 'answer', checkId: 'vpn', value: 'disconnected' });
  assert.equal(s.status, 'handoff_ready'); assert.equal(s.calls.length, calls);
  assert.equal(s.answers.vpn, 'disconnected');
  assert.equal(s.evidence.find(e => e.kind === 'observed').observedState, 'connected');
  assert.equal(s.evidence.at(-1).kind, 'discrepancy');
  assert.match(s.report, /撮影時点/); assert.match(s.report, /根本原因: 未確定/);
});
test('matching image and report continue diagnosis; VPN connection alone never closes case', async () => {
  const x = await scenario(); await x.act({ action: 'image', checkId: 'vpn', image });
  const s = await x.act({ action: 'answer', checkId: 'vpn', value: 'connected' });
  assert.equal(s.status, 'triaging'); assert.equal(s.currentCheck.id, 'error_screen');
  assert.equal(s.evidence.some(e => e.kind === 'discrepancy'), false);
});
test('wrong screen does not falsely contradict an employee answer', async () => {
  const x = await scenario({ screen: 'browser', state: 'login' }); await x.act({ action: 'image', checkId: 'vpn', image });
  const s = await x.act({ action: 'answer', checkId: 'vpn', value: 'connected' });
  assert.equal(s.status, 'triaging'); assert.equal(s.evidence.some(e => e.kind === 'discrepancy'), false);
});
test('unreadable image remains unknown and manual answer can continue', async () => {
  const x = await scenario({ screen: 'unreadable', state: 'unknown' }); await x.act({ action: 'image', checkId: 'vpn', image });
  assert.equal(x.state().answers.vpn, undefined);
  const s = await x.act({ action: 'answer', checkId: 'vpn', value: 'connected' });
  assert.equal(s.status, 'triaging'); assert.equal(s.evidence.some(e => e.kind === 'discrepancy'), false);
});
test('image outage creates no observation and preserves current check and unknown cost', async () => {
  const x = await scenario('outage'); const before = x.state().evidence.length;
  const s = await x.act({ action: 'image', checkId: 'vpn', image });
  assert.equal(s.evidence.length, before); assert.equal(s.currentCheck.id, 'vpn');
  assert.equal(s.latestRequest.costUsd, null); assert.match(s.messages.at(-1).content, /確認結果は追加していません/);
});
test('full diagnostic path transfers reported access refusal with sources and both evidence kinds', async () => {
  const x = await scenario(); await x.act({ action: 'image', checkId: 'vpn', image });
  await x.act({ action: 'answer', checkId: 'vpn', value: 'connected' });
  const s = await x.act({ action: 'answer', checkId: 'error_screen', value: 'denied' });
  assert.equal(s.assignee, 'ID・アクセス担当（デモ）'); assert.equal(s.status, 'handoff_ready');
  assert.match(s.report, /社員の申告/); assert.match(s.report, /画像の観察/); assert.match(s.report, /IAM-001/);
  assert.match(s.report, /業務への影響/); assert.match(s.report, /根本原因: 未確定/);
});
