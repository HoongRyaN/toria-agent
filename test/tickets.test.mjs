import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTicketStore } from '../tickets.mjs';
import { createTriageService } from '../triage.mjs';
import { createApp } from '../server.mjs';
function setup(t) { const path = mkdtempSync(join(tmpdir(), 'toria-test-')); t.after(() => rmSync(path, { recursive: true, force: true })); return { path, store: createTicketStore(path) }; }
const snapshot = () => ({ id: randomUUID(), displayId: 'TR-DEMO', issue: '架空サイトが開けない', assignee: 'ITヘルプデスク（デモ）', evidence: [{ id: 'E1', kind: 'observed', detail: 'VPN表示・端末は未検証' }], sources: ['VPN-001'] });
const update = (store, t, action, note = '') => store.update({ ticketId: t.id, revision: t.revision, requestId: randomUUID(), action, note });
test('ticket persists across store reloads; creation is unique by case and keeps original evidence', t => {
  const { store, path } = setup(t); const s = snapshot();
  const a = store.create(s, 'original report'); s.evidence[0].detail = 'changed after create';
  assert.equal(store.create(s, 'new report').id, a.id);
  const reloaded = createTicketStore(path).list();
  assert.equal(reloaded.length, 1); assert.equal(reloaded[0].report, 'original report');
  assert.equal(reloaded[0].evidence[0].detail, 'VPN表示・端末は未検証');
});
test('operator cannot close directly; employee rejection and recurrence retain history on same ticket', t => {
  const { store } = setup(t); let a = store.create(snapshot(), 'evidence'); const id = a.id;
  assert.throws(() => update(store, a, 'confirm'), e => e.status === 409);
  a = update(store, a, 'claim');
  assert.throws(() => update(store, a, 'propose'), e => e.status === 400);
  a = update(store, a, 'propose', '架空の対応記録'); assert.equal(a.status, 'awaiting_confirmation');
  a = update(store, a, 'reject'); assert.equal(a.status, 'working');
  a = update(store, a, 'propose', '架空の再確認'); a = update(store, a, 'confirm');
  assert.equal(a.status, 'closed'); assert.match(a.history.at(-1).text, /独立検証なし/);
  a = update(store, a, 'reopen'); assert.equal(a.id, id); assert.equal(a.status, 'working');
  assert.equal(a.history.length, 7); assert.equal(a.evidence.length, 1);
});
test('duplicate operations survive restart; stale or changed requests cannot double-update', t => {
  const { store, path } = setup(t); const a = store.create(snapshot(), 'report');
  const b = { ticketId: a.id, revision: a.revision, action: 'claim', note: '', requestId: randomUUID() };
  store.update(b); const other = createTicketStore(path);
  assert.equal(other.update(b).history.length, 2);
  assert.throws(() => other.update({ ...b, action: 'confirm' }), e => e.status === 409);
  assert.throws(() => other.update({ ...b, requestId: randomUUID() }), e => e.status === 409);
});
test('corrupted stored tickets are not silently overwritten', t => {
  const { store, path } = setup(t); const file = join(path, 'tickets.json');
  writeFileSync(file, 'broken file');
  assert.throws(() => store.create(snapshot(), 'report'), e => e.status === 503);
  assert.equal(readFileSync(file, 'utf8'), 'broken file');
});
test('triage creates a durable ticket only after handoff, idempotently without extra model call', async t => {
  const { store } = setup(t);
  const svc = createTriageService({ config: () => ({}), tickets: store, fetchFn: () => assert.fail('no model call expected') });
  let s = await svc.handle({ action: 'start', text: '担当者に引き継ぎたい', requestId: randomUUID() });
  const body = { action: 'create_ticket', sessionId: s.id, revision: s.revision, requestId: randomUUID() };
  s = await svc.handle(body); assert.ok(s.ticket.id); assert.equal(s.calls.length, 0);
  assert.match(s.report, /状態: ローカル模擬チケット作成済み/);
  await svc.handle({ ...body, revision: s.revision, requestId: randomUUID() });
  assert.equal(store.list().length, 1);
  const latest = svc.get(s.id);
  await assert.rejects(svc.handle({ action: 'reopen', sessionId: s.id, revision: latest.revision, requestId: randomUUID() }), e => e.status === 409);
});
test('ticket HTTP routes validate origin, reject secret notes and keep persistence directory private', async t => {
  const { path, store } = setup(t); const a = store.create(snapshot(), 'report');
  const app = createApp({ dataDir: path, config: () => ({}) });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const payload = { ticketId: a.id, revision: 1, action: 'claim', requestId: randomUUID() };
  const foreign = await fetch(`${base}/api/tickets`, { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(foreign.status, 403);
  const secret = await fetch(`${base}/api/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, note: 'sk-orca-TEST_SECRET' }) });
  assert.equal(secret.status, 400); assert.equal(store.list()[0].revision, 1);
  assert.equal((await fetch(`${base}/data/tickets.json`)).status, 404);
  assert.equal((await (await fetch(`${base}/api/tickets`)).json()).tickets[0].id, a.id);
});
