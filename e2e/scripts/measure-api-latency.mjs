// Measures the response time of the dashboard, the reports and the bug list on the seeded baseline (NFR-PERF-02: dashboard p95 under 500 ms).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 measure-api-latency.mjs [--n 50]
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. Read only: it changes no data.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const API = arg('--api', 'http://localhost:8000') + '/api/v1';
const N = Number(arg('--n', '50'));
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const get = async (path, token) => {
  const t0 = performance.now();
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  await res.arrayBuffer();
  return { ms: performance.now() - t0, status: res.status };
};
const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'lukas@lumenfreight.test', password: PW }) })).json();
const token = login.access_token;
const orgs = await (await fetch(`${API}/orgs`, { headers: { Authorization: `Bearer ${token}` } })).json();
const org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
const today = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

const cases = [
  ['dashboard', `${org}/dashboard`],
  ['bug trend (30 days)', `${org}/reports/bug-trend?from=${from}&to=${today}&interval=day`],
  ['summary (30 days)', `${org}/reports/summary?from=${from}&to=${today}`],
  ['bug list (page of 25)', `${org}/bugs?page_size=25`],
  ['releases (with readiness)', `${org}/releases?page_size=25`],
];
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
let worst = 0;
for (const [name, path] of cases) {
  await get(path, token); // warm up
  const times = [];
  for (let i = 0; i < N; i++) {
    const r = await get(path, token);
    if (r.status !== 200) { console.error(`${name}: status ${r.status}`); process.exit(1); }
    times.push(r.ms);
  }
  times.sort((a, b) => a - b);
  if (name === 'dashboard') worst = pct(times, 95);
  console.log(`${name.padEnd(28)} n=${N}  p50 ${pct(times, 50).toFixed(0)} ms  p95 ${pct(times, 95).toFixed(0)} ms  max ${times.at(-1).toFixed(0)} ms`);
}
console.log(worst < 500 ? `PASS: dashboard p95 ${worst.toFixed(0)} ms is under 500 ms` : `FAIL: dashboard p95 ${worst.toFixed(0)} ms is not under 500 ms`);
process.exit(worst < 500 ? 0 : 1);
