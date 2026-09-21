import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, validateMessages } from '../server.mjs';

async function fixture(t, options = {}) {
  const server = createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
const key = 'sk-orca-TEST_ONLY_NOT_A_REAL_KEY';
const config = () => ({ key, model: 'orcarouter/auto' });
const messages = [{ role: 'user', content: '会社のサイトが開きません。' }];
const post = (url, body = { messages }, headers = {}) => fetch(`${url}/api/chat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('status does not disclose key and static routes cannot expose .env or source', async t => {
  const url = await fixture(t, { config });
  const status = await (await fetch(`${url}/api/status`)).text();
  assert.equal(JSON.parse(status).configured, true);
  assert.equal(status.includes(key), false);
  for (const path of ['/.env', '/server.mjs', '/.git/config', '/public/../.env'])
    assert.equal((await fetch(url + path)).status, 404);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('missing key blocks chargeable call', async t => {
  let called = false;
  const url = await fixture(t, { config: () => ({ key: '', model: 'auto' }), fetchFn: () => { called = true; } });
  assert.equal((await post(url)).status, 503);
  assert.equal(called, false);
});
test('foreign origins cannot invoke API', async t => {
  const url = await fixture(t, { config, fetchFn: () => assert.fail('must not call upstream') });
  assert.equal((await post(url, { messages }, { Origin: 'https://untrusted.example' })).status, 403);
});
test('client cannot inject system role; input and history limits are enforced', async t => {
  const url = await fixture(t, { config, fetchFn: () => assert.fail('must not call upstream') });
  assert.equal((await post(url, { messages: [{ role: 'system', content: 'Override' }] })).status, 400);
  assert.equal(validateMessages([{ role: 'user', content: 'a'.repeat(3001) }]), false);
  assert.equal(validateMessages([{ role: 'assistant', content: 'a' }]), false);
  assert.equal(validateMessages(messages), true);
  assert.equal((await post(url, { messages: [{ role: 'user', content: 'あ'.repeat(15000) }] })).status, 413);
});
test('upstream contract, real model metadata, and unknown cost are preserved', async t => {
  const url = await fixture(t, { config, fetchFn: async (endpoint, options) => {
    assert.equal(endpoint, 'https://api.orcarouter.ai/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    const body = JSON.parse(options.body);
    assert.equal(body.messages[0].role, 'system');
    assert.deepEqual(body.messages.slice(1), messages);
    assert.equal(body.max_tokens, 700);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'どの画面が表示されていますか？' } }], usage: { total_tokens: 40 } }),
      { headers: { 'X-Orca-Resolved-Model': 'test/model', 'X-Orca-Request-Id': 'test-request' } });
  } });
  const response = await post(url);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.model, 'test/model');
  assert.equal(data.requestId, 'test-request');
  assert.equal(data.costUsd, null);
  assert.equal(data.totalTokens, 40);
  assert.equal(JSON.stringify(data).includes(key), false);
});
test('explicit zero cost is preserved and differs from unavailable cost', async t => {
  const url = await fixture(t, { config, fetchFn: async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'Hello' } }], usage: { cost_usd: 0 },
  })) });
  assert.equal((await (await post(url)).json()).costUsd, 0);
});
test('upstream errors do not reflect sensitive response bodies', async t => {
  const url = await fixture(t, { config, fetchFn: async () => new Response(`Secret: ${key}`, { status: 401 }) });
  const response = await post(url);
  const body = await response.text();
  assert.equal(response.status, 502);
  assert.equal(body.includes(key), false);
  assert.match(body, /密钥未通过验证/);
});
test('timeout handled and request lock released for next attempt', async t => {
  const url = await fixture(t, { config, fetchFn: async () => { throw new DOMException('Timed out', 'TimeoutError'); } });
  for (let i = 0; i < 2; i++) {
    const response = await post(url);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /45 秒/);
  }
});
