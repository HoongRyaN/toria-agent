import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../server.mjs';
import { providerDiagnostic } from '../provider-diagnostics.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Only allow fixed fields into the shareable report. Never include credentials,
// provider bodies, request headers, environment values, or raw error messages.
export async function checkConnections({ fetchFn = fetch, localHtml = '' } = {}) {
  const result = {};
  try {
    const response = await fetchFn('http://127.0.0.1:4317/api/status', {
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    result.localServer = { httpStatus: response.status };
    if (response.ok) {
      const body = await response.json();
      result.localServer.recognized = body.milestone === 4 && typeof body.configured === 'boolean';
      result.localServer.keyConfigured = body.configured === true;
    }
    const page = await fetchFn('http://127.0.0.1:4317/', {
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    const html = page.ok ? await page.text() : '';
    result.localServer.diagnosticUiPresent = html.includes('id="api-result"');
    result.localServer.pageMatchesThisFolder = Boolean(localHtml) && html === localHtml;
  } catch {
    result.localServer = { failureCode: 'local_server_unavailable_or_unrecognized' };
  }
  try {
    // Public models listing: no Authorization header and no inference request.
    const response = await fetchFn('https://api.orcarouter.ai/v1/models', {
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    result.orcaNetwork = {
      httpStatus: response.status,
      receivedHttpResponse: true,
    };
    await response.body?.cancel();
  } catch (error) {
    result.orcaNetwork = { receivedHttpResponse: false, ...providerDiagnostic(error) };
  }
  result.modelCall = 'NOT_TESTED: network reachability does not validate your key, model, or credit.';
  return result;
}

async function main() {
  const report = {
    reportVersion: 1,
    checkedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, nodeSupported: Number(process.versions.node.split('.')[0]) >= 22 },
    files: {
      envExists: existsSync(join(ROOT, '.env')),
      envTxtExists: existsSync(join(ROOT, '.env.txt')),
      diagnosticCodePresent: existsSync(join(ROOT, 'provider-diagnostics.mjs')),
    },
  };
  try {
    const { key } = loadConfig();
    report.config = { keyPresent: Boolean(key), keyHasWhitespace: /\s/.test(key), keyIsAscii: /^[\x21-\x7e]*$/.test(key) };
  } catch {
    report.config = { failureCode: 'configuration_unreadable' };
  }
  Object.assign(report, await checkConnections({ localHtml: readFileSync(join(ROOT, 'public/index.html'), 'utf8') }));
  console.log(JSON.stringify(report, null, 2));
  try {
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    writeFileSync(join(ROOT, 'data/connection-check.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('\nSaved: data/connection-check.json (ignored by Git).');
  } catch {
    console.log('\nReport could not be saved. Copy the JSON above instead.');
  }
  console.log('Next: send a fictional issue in TORIA and inspect the API result. Image calls must be checked separately.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Diagnostic could not complete. Check the project files and Node.js version.'); process.exitCode = 1; });
}
