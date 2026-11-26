// Live AI smoke test (local only, never run in CI): calls each of the six AI features ONCE against the real provider and reports
// pass or fail, response time and token use from the usage rows (and cost when you give it the prices).
//
// Before you run it:
//   1. Put the key in the repository's .env (gitignored, never commit it): ANTHROPIC_API_KEY=... and AI_PROVIDER=anthropic
//   2. Recreate the backend so it reads .env:  docker compose up -d --force-recreate backend
//   3. Baseline seed loaded (the script signs in as seeded people; SEED_USER_PASSWORD is read from .env, never printed).
// Run (stack up):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 smoke-live-ai.mjs
//   Cost needs the current price per million tokens from Anthropic's pricing page, passed as environment variables:
//   PRICE_IN_PER_MTOK=<usd> PRICE_OUT_PER_MTOK=<usd>   (without them the script prints tokens only and does not guess a price)
//
// Spend: six calls with very short inputs (a 3 case generation, a two line log), so a few thousand tokens in total.
// Safety: the script stops before any call unless the workspace reports provider "anthropic", so it can never "pass" against the mock.
// Test data: a project with one bug and a release, removed in `finally` (bugs deleted, project archived, release deleted).
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const API = arg('--api', 'http://localhost:8000');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const PRICE_IN = Number(process.env.PRICE_IN_PER_MTOK);
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_MTOK);
const HAS_PRICE = Number.isFinite(PRICE_IN) && Number.isFinite(PRICE_OUT) && PRICE_IN > 0 && PRICE_OUT > 0;

const RUN = Date.now();
const KEY = `Z${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const NAME = `smoke-live-ai-${RUN}`;
const log = (m) => console.log(`smoke-live-ai: ${m}`);

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 */ }
  return { status: res.status, json };
}
async function login(email) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password: PW } });
  if (r.status !== 200) throw new Error(`could not sign in ${email.split('@')[0]}: ${r.status}`);
  return r.json.access_token;
}

const state = { orgId: '', project: null, release: null, token: '' };
const O = () => `/orgs/${state.orgId}`;

async function cleanup() {
  if (!state.token) return;
  const notes = [];
  if (state.release) notes.push(`release deleted (${(await api(`${O()}/releases/${state.release.id}`, { method: 'DELETE', token: state.token })).status})`);
  if (state.project) {
    const bugs = (await api(`${O()}/bugs?project_id=${state.project.id}&page_size=100`, { token: state.token })).json?.items ?? [];
    for (const b of bugs) await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.token });
    notes.push(`${bugs.length} bug(s) deleted`);
    notes.push(`project archived (${(await api(`${O()}/projects/${state.project.id}`, { method: 'PATCH', token: state.token, body: { archived: true } })).status})`);
  }
  log(`cleanup: ${notes.join(', ')}`);
}

async function main() {
  const adminToken = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: adminToken });
  state.orgId = orgs.json.find((o) => o.org.slug === 'lumen').org.id;
  const members = (await api(`${O()}/members?page_size=100`, { token: adminToken })).json.items;
  const lead = members.find((m) => m.role === 'qa_lead' && m.user.email.endsWith('@lumenfreight.test'))?.user;
  if (!lead) throw new Error('the baseline seed has no QA Lead');
  state.token = await login(lead.email);
  const T = state.token;

  const summary = (await api(`${O()}/ai/usage/summary`, { token: T })).json;
  if (summary?.provider !== 'anthropic') {
    console.error(`smoke-live-ai: STOPPED, the provider is "${summary?.provider}", not "anthropic". Set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY in .env and recreate the backend. No call was made.`);
    process.exit(2);
  }
  if (!summary.ai_enabled) { console.error('smoke-live-ai: STOPPED, AI is switched off for the workspace (Settings). No call was made.'); process.exit(2); }
  log(`provider ${summary.provider}, model ${summary.model}`);

  state.project = (await api(`${O()}/projects`, { method: 'POST', token: T, body: { name: NAME, key: KEY } })).json;
  if (!state.project?.id) throw new Error('could not create the project');
  const pid = state.project.id;
  const existing = (await api(`${O()}/bugs`, { method: 'POST', token: T, body: { project_id: pid, title: 'Checkout total ignores discount code after changing delivery address', severity: 'high' } })).json;
  const target = (await api(`${O()}/bugs`, { method: 'POST', token: T, body: { project_id: pid, title: 'Payment error on Checkout in prod', severity: 'low', priority: 'p4' } })).json;
  state.release = (await api(`${O()}/releases`, { method: 'POST', token: T, body: { project_id: pid, name: `${NAME} release` } })).json;
  await api(`${O()}/releases/${state.release.id}/bugs`, { method: 'POST', token: T, body: { bug_ids: [existing.id, target.id] } });

  const calls = [
    ['bug_writer', 'Bug Writer', 'bug-writer', { project_id: pid, notes: 'Pay button crashes the page in prod\n1. Open the cart\n2. Press Pay' }],
    ['explain_log', 'Explain this log', 'explain-log', { log: 'INFO order 4411 started\nERROR NullPointerException at PaymentService.charge(PaymentService.java:88)' }],
    ['duplicates', 'Duplicate check', 'duplicates', { project_id: pid, title: 'Discount code ignored in checkout total' }],
    ['triage', 'Triage', 'triage', { bug_id: target.id }],
    ['test_cases', 'Test Case Generator', 'test-cases', { project_id: pid, story: 'As a shopper I can apply one discount code at checkout and see the total update.', count: 3 }],
    ['release_summary', 'Release Summary', 'release-summary', { release_id: state.release.id }],
  ];

  const rows = [];
  for (const [feature, label, path, body] of calls) {
    const started = Date.now();
    const r = await api(`${O()}/ai/${path}`, { method: 'POST', token: T, body });
    const wall = Date.now() - started;
    const usage = (await api(`${O()}/ai/usage?feature=${feature}&page_size=1`, { token: T })).json?.items?.[0];
    const fresh = usage && new Date(usage.created_at).getTime() >= started - 2000;
    const fellBack = r.json?.fallback === true || usage?.status === 'fallback';
    const pass = r.status === 200 && fresh && usage.status === 'ok' && !fellBack;
    const inTok = fresh ? usage.input_tokens : 0;
    const outTok = fresh ? usage.output_tokens : 0;
    const cost = HAS_PRICE ? (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000 : null;
    rows.push({ label, pass, http: r.status, status: fresh ? usage.status : 'no usage row', ms: fresh ? usage.latency_ms : wall, inTok, outTok, cost });
  }

  console.log('');
  console.log('feature              result  http  usage status   time ms  in tok  out tok  cost USD');
  for (const x of rows) {
    console.log(`${x.label.padEnd(20)} ${(x.pass ? 'PASS' : 'FAIL').padEnd(7)} ${String(x.http).padEnd(5)} ${String(x.status).padEnd(14)} ${String(x.ms).padEnd(8)} ${String(x.inTok).padEnd(7)} ${String(x.outTok).padEnd(8)} ${x.cost === null ? 'n/a' : x.cost.toFixed(5)}`);
  }
  const totIn = rows.reduce((s, x) => s + x.inTok, 0);
  const totOut = rows.reduce((s, x) => s + x.outTok, 0);
  console.log('');
  log(`total tokens: ${totIn} in, ${totOut} out${HAS_PRICE ? `, about ${((totIn * PRICE_IN + totOut * PRICE_OUT) / 1_000_000).toFixed(5)} USD` : ' (set PRICE_IN_PER_MTOK and PRICE_OUT_PER_MTOK for a cost; the usage rows hold tokens, not money)'}`);
  const failed = rows.filter((x) => !x.pass);
  log(failed.length ? `FAIL: ${failed.map((x) => x.label).join(', ')}` : 'PASS: all six features answered from the real provider');
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => { console.error(`smoke-live-ai: ${e.message}`); process.exitCode = 1; }).finally(cleanup);
