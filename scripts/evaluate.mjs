import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { loadConfig } from '../server.mjs';
import { createTriageService } from '../triage.mjs';
import { inspectImage } from '../vision.mjs';

if (!process.argv.includes('--live')) {
  console.log('Run node scripts/evaluate.mjs --live to make SIX real OrcaRouter calls using fictional fixtures. This consumes API credit. No real employee data is used.');
  process.exit(0);
}
const config = loadConfig();
if (!config.key?.startsWith('sk-orca-')) throw new Error('Configure the local OrcaRouter key before running.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
const selectedCase = process.argv.find(a => a.startsWith('--case='))?.slice(7);
const runName = process.argv.find(a => a.startsWith('--run='))?.slice(6);
if (runName && !/^[a-z0-9-]{1,40}$/.test(runName)) throw new Error('Use a short lowercase run name.');
for (const c of [
  { id: 'vpn-connected', path: '../public/demo/vpn.png', expected: { matches: true, readable: true, state: 'connected' } },
  { id: 'wrong-login-screen', path: '../public/demo/login.png', expected: { matches: false, readable: false, state: 'login' } },
  { id: 'blank-image', path: '../test/fixtures/blank.png', expected: { matches: false, readable: false, state: 'unknown' } },
  { id: 'embedded-instruction', path: '../test/fixtures/instruction.png', expected: { matches: false, readable: false, state: 'login' } },
]) {
  if (selectedCase && selectedCase !== c.id) continue;
  const bytes = readFileSync(new URL(c.path, import.meta.url));
  const actual = await inspectImage({ image: 'data:image/png;base64,' + bytes.toString('base64'), checkId: 'vpn', config: () => config, fetchFn: fetch });
  const passed = actual.ok && Object.entries(c.expected).every(([key, value]) => actual[key] === value);
  results.push({ id: c.id, inputSha256: hash(bytes), expected: c.expected, actual: { ok: actual.ok, matches: actual.matches ?? null, readable: actual.readable ?? null, state: actual.state ?? null }, passed, meta: actual.meta });
  console.log(`${c.id}: ${passed ? 'PASS' : 'FAIL'}`);
}
for (const c of [
  { id: 'remote-work-context', text: '自宅で仕事をしていますが、会社のサイトにアクセスできません。', expected: 'location' },
  { id: 'urgent-work-context', text: '会社のサイトが開けず、急ぎの業務が完全に止まっています。', expected: 'impact' },
]) {
  if (selectedCase && selectedCase !== c.id) continue;
  const service = createTriageService({ config: () => config });
  const s = await service.handle({ action: 'start', requestId: randomUUID(), text: c.text });
  const passed = s.currentCheck?.mode === 'ai' && s.currentCheck.id === c.expected;
  results.push({ id: c.id, input: c.text, inputSha256: hash(c.text), expected: c.expected, actual: s.currentCheck?.id, mode: s.currentCheck?.mode, passed, meta: s.latestRequest });
  console.log(`${c.id}: ${passed ? 'PASS' : 'FAIL'}`);
}
const sourceHashes = Object.fromEntries(['../triage.mjs', '../vision.mjs', '../knowledge/company-it.json'].map(f => [f.slice(3), hash(readFileSync(new URL(f, import.meta.url)))]));
const measured = results.filter(r => r.meta?.costUsd != null);
const output = { measuredAt: new Date().toISOString(), node: process.version, mode: 'live', requestedModels: { text: config.model, image: config.visionModel }, sourceHashes, calls: results.length, passed: results.filter(r => r.passed).length, knownCostUsd: measured.reduce((s, r) => s + r.meta.costUsd, 0), unknownCosts: results.length - measured.length, limitations: `${results.length} fixed synthetic inputs, one attempt each. Not a benchmark, human accuracy study, prompt-injection guarantee, or settled billing total.`, results };
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL(runName ? `../docs/evaluation-${runName}.json` : selectedCase ? '../docs/evaluation-followup.json' : '../docs/evaluation-results.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ calls: output.calls, passed: output.passed, knownCostUsd: output.knownCostUsd, unknownCosts: output.unknownCosts }));
if (output.passed !== output.calls) process.exitCode = 1;
