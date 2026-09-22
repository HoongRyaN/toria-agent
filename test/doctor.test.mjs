import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnections } from '../scripts/doctor.mjs';

const html = '<p id="api-result">API</p>';
test('doctor checks public connectivity without sending authorization or making inference calls', async () => {
  const urls = [];
  const result = await checkConnections({ localHtml: html, fetchFn: async (url, options) => {
    urls.push(url);
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    if (url.endsWith('/api/status')) return Response.json({ milestone: 4, configured: true, model: 'SECRET-DO-NOT-PRINT' });
    return new Response(url.endsWith('/models') ? 'SECRET-UPSTREAM-BODY' : html);
  } });
  assert.equal(urls.length, 3);
  assert.equal(result.localServer.keyConfigured, true);
  assert.equal(result.localServer.pageMatchesThisFolder, true);
  assert.equal(result.orcaNetwork.httpStatus, 200);
  assert.match(result.modelCall, /NOT_TESTED/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test('doctor separates local service failure from blocked outbound network without raw error leakage', async () => {
  const result = await checkConnections({ fetchFn: async () => {
    throw new TypeError('SECRET', { cause: { code: 'EACCES', message: 'SECRET' } });
  } });
  assert.equal(result.localServer.failureCode, 'local_server_unavailable_or_unrecognized');
  assert.equal(result.orcaNetwork.failureCode, 'network_denied');
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test('doctor detects an older page and does not mistake public endpoint rejection for key validation', async () => {
  const result = await checkConnections({ localHtml: html, fetchFn: async url => {
    if (url.endsWith('/api/status')) return Response.json({ milestone: 4, configured: false });
    return new Response('old page', { status: url.endsWith('/models') ? 403 : 200 });
  } });
  assert.equal(result.localServer.diagnosticUiPresent, false);
  assert.equal(result.localServer.pageMatchesThisFolder, false);
  assert.equal(result.orcaNetwork.receivedHttpResponse, true);
  assert.equal(result.orcaNetwork.httpStatus, 403);
  assert.match(result.modelCall, /NOT_TESTED/);
});
