import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTriageService } from '../triage.mjs';
import { inspectImage } from '../vision.mjs';
import { providerDiagnostic } from '../provider-diagnostics.mjs';

const config = () => ({ key: 'sk-orca-TEST_NOT_REAL', model: 'orcarouter/auto' });
const blockedFetch = async () => { throw new TypeError('Private error text must stay private', { cause: { code: 'EACCES' } }); };

test('denied network produces an actionable diagnostic without losing intake or exposing raw errors', async () => {
  const service = createTriageService({ config, fetchFn: blockedFetch });
  const s = await service.handle({ action: 'start', text: '会社のサイトが開きません', requestId: randomUUID() });
  assert.equal(s.currentCheck.mode, 'fallback');
  assert.equal(s.latestRequest.failureCode, 'network_denied');
  assert.equal(s.usage.unknownCosts, 1);
  assert.equal(s.evidence[0].detail, '会社のサイトが開きません');
  assert.match(s.lastSelection.warning, /ネットワークへの接続が拒否/);
  assert.equal(JSON.stringify(s).includes('Private error text'), false);
});

test('image transport denial is distinguishable from an unreadable image', async () => {
  const result = await inspectImage({ image: 'mock-image', checkId: 'vpn', config, fetchFn: blockedFetch });
  assert.equal(result.ok, false);
  assert.equal(result.meta.failureCode, 'network_denied');
  assert.equal(result.meta.costUsd, null);
  assert.equal(result.state, undefined);
});

test('HTTP authentication and budget failures remain distinct and never reflect response bodies', async () => {
  for (const [status, code] of [[401, 'authentication_failed'], [402, 'budget_exceeded']]) {
    const service = createTriageService({ config, fetchFn: async () => new Response('sk-orca-UPSTREAM_PRIVATE_DATA', { status }) });
    const s = await service.handle({ action: 'start', text: '会社のサイトが開きません', requestId: randomUUID() });
    assert.equal(s.latestRequest.failureCode, code);
    assert.equal(s.latestRequest.httpStatus, status);
    assert.equal(s.latestRequest.costUsd, null);
    assert.equal(JSON.stringify(s).includes('UPSTREAM_PRIVATE_DATA'), false);
  }
});

test('unrecognized failures expose a fixed message rather than raw exception details', () => {
  const diagnostic = providerDiagnostic(new Error('private request and credentials'));
  assert.equal(diagnostic.failureCode, 'request_failed');
  assert.equal(JSON.stringify(diagnostic).includes('credentials'), false);
});
