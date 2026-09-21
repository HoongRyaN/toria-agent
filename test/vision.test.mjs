import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateImage, inspectImage } from '../vision.mjs';
import { createTriageService } from '../triage.mjs';
const image = 'data:image/png;base64,' + readFileSync(new URL('../public/demo/login.png', import.meta.url)).toString('base64');
const config = () => ({ key: 'sk-orca-TEST', model: 'orcarouter/auto' });
const response = (name, args) => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }], usage: { cost_usd: 0.001 } }));
const imageStub = async () => response('inspect_check_image', { screen: 'browser', state: 'login' });
test('only bounded inline PNG/JPEG bytes accepted, no external URLs or SVG', () => {
  assert.equal(validateImage(image).length, 64);
  for (const x of ['https://internal/image', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,' + 'a'.repeat(2800001)]) assert.throws(() => validateImage(x));
});
test('wrong screen generates observation and guidance, not a device verdict', async () => {
  const r = await inspectImage({ image, checkId: 'vpn', config, fetchFn: imageStub });
  assert.equal(r.ok, true); assert.equal(r.matches, false); assert.match(r.detail, /未検証/);
  assert.match(r.guidance, /VPNアプリ/);
});
test('invalid tool output and provider outage never fabricate image observations', async () => {
  for (const fetchFn of [async () => response('inspect_check_image', { screen: 'vpn', state: 'login' }), async () => { throw new Error('private provider details'); }]) {
    const r = await inspectImage({ image, checkId: 'vpn', config, fetchFn });
    assert.equal(r.ok, false); assert.equal(r.detail, undefined); assert.ok(!JSON.stringify(r).includes('private'));
  }
});
test('image action keeps check unanswered, preserves provenance, discards raw image and deduplicates retries', async () => {
  let visionCalls = 0;
  const service = createTriageService({ config, fetchFn: async (url, options) => {
    const req = JSON.parse(options.body);
    if (req.tools[0].function.name === 'inspect_check_image') { visionCalls++; return imageStub(); }
    const ids = JSON.parse(req.messages[1].content).allowed_checks.map(c => c.id);
    return response('select_next_check', { check_id: ['location', 'public_web', 'vpn'].find(id => ids.includes(id)) || ids[0] });
  } });
  let s = await service.handle({ action: 'start', text: '自宅で会社のサイトが開かない', requestId: randomUUID() });
  const act = b => service.handle({ sessionId: s.id, revision: s.revision, requestId: randomUUID(), ...b });
  s = await act({ action: 'answer', checkId: 'location', value: 'remote' });
  s = await act({ action: 'answer', checkId: 'public_web', value: 'yes' });
  const body = { action: 'image', checkId: 'vpn', image, sessionId: s.id, revision: s.revision, requestId: randomUUID() };
  s = await service.handle(body);
  await service.handle(body);
  assert.equal(visionCalls, 1); assert.equal(s.currentCheck.id, 'vpn'); assert.equal(s.answers.vpn, undefined);
  assert.equal(s.evidence.at(-1).kind, 'observed'); assert.match(s.report, /画像の観察（AI）/);
  assert.ok(!JSON.stringify(service.get(s.id)).includes('base64'));
  await assert.rejects(act({ action: 'image', checkId: 'vpn', image }), e => e.status === 400);
  assert.equal(visionCalls, 1);
  s = await act({ action: 'answer', checkId: 'vpn', value: 'unable' });
  assert.equal(s.answers.vpn, 'unable'); assert.equal(s.evidence.at(-1).kind, 'not_completed');
});
