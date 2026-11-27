// I-09 acceptance flow: the Dashboard (SCR-05) and Reports (SCR-18): the numbers match the data, the project select narrows them, the
// empty state of a project without bugs, the Developer's own bugs, the range checks and the CSV export with its formula escaping.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-dashboard-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: two projects (keys S and R + 4 letters, "flow-i09-<timestamp>"), four bugs in the first, a release and a run. Cleanup in
// `finally`: bugs and the release are deleted, the suite is deleted and both projects archived. The run stays (BL-027).
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:3000');
const API = arg('--api', 'http://localhost:8000');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const RUN = Date.now();
const letters = [...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('');
const NAME = `flow-i09-${RUN}`;
const log = (m) => console.log(`flow-i09: ${m}`);
const check = (c, m) => { if (!c) throw new Error(m); };

async function api_(path, { method = 'GET', token, body } = {}) {
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
  const r = await api_('/auth/login', { method: 'POST', body: { email, password: PW } });
  check(r.status === 200, `could not sign in ${email.split('@')[0]}: ${r.status}`);
  return r.json.access_token;
}
async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function signIn(page, email) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/*/dashboard');
}

const state = { orgId: '', projects: [], suite: null, bugs: [], release: null, leadToken: '' };
const O = () => `/orgs/${state.orgId}`;

async function cleanup() {
  const notes = [];
  for (const b of state.bugs) notes.push(`bug ${b.key} deleted (${(await api_(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.release) notes.push(`release deleted (${(await api_(`${O()}/releases/${state.release.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.suite) notes.push(`suite deleted (${(await api_(`${O()}/test-suites/${state.suite.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  for (const p of state.projects) notes.push(`project archived (${(await api_(`${O()}/projects/${p.id}`, { method: 'PATCH', token: state.leadToken, body: { archived: true } })).status})`);
  log(`cleanup: ${notes.join(', ')}`);
}

async function main() {
  const adminToken = await login('amara@lumenfreight.test');
  const orgs = await api_('/orgs', { token: adminToken });
  state.orgId = orgs.json.find((o) => o.org.slug === 'lumen').org.id;
  const members = (await api_(`${O()}/members?page_size=100`, { token: adminToken })).json.items;
  const person = (role) => members.find((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test'))?.user;
  const lead = person('qa_lead'); const dev = person('developer'); const viewer = person('viewer');
  check(lead && dev && viewer, 'the baseline seed has no QA Lead, Developer or Viewer');
  state.leadToken = await login(lead.email);
  const T = state.leadToken;

  const full = (await api_(`${O()}/projects`, { method: 'POST', token: T, body: { name: `${NAME} data`, key: `S${letters}` } })).json;
  const bare = (await api_(`${O()}/projects`, { method: 'POST', token: T, body: { name: `${NAME} bare`, key: `R${letters}` } })).json;
  state.projects.push(full, bare);
  const comp = (await api_(`${O()}/projects/${full.id}/components`, { method: 'POST', token: T, body: { name: 'Checkout' } })).json;
  const bug = async (title, severity, extra = {}) => {
    const r = await api_(`${O()}/bugs`, { method: 'POST', token: T, body: { project_id: full.id, title, severity, component_id: comp.id, ...extra } });
    check(r.status === 201, `could not create ${title}: ${r.status}`);
    state.bugs.push(r.json);
    return r.json;
  };
  const critical = await bug(`${NAME} critical bug`, 'critical');
  await bug(`${NAME} high bug`, 'high', { assignee_id: dev.id });
  await bug(`=HYPERLINK("http://example.test") ${NAME}`, 'medium');
  const done = await bug(`${NAME} finished bug`, 'low');
  for (const to of ['triaged', 'in_progress', 'fixed', 'ready_for_retest', 'verified']) {
    await api_(`${O()}/bugs/${done.id}/transitions`, { method: 'POST', token: T, body: { to_status: to } });
  }
  state.suite = (await api_(`${O()}/test-suites`, { method: 'POST', token: T, body: { project_id: full.id, name: `${NAME} suite` } })).json;
  for (const n of [1, 2, 3]) await api_(`${O()}/test-suites/${state.suite.id}/cases`, { method: 'POST', token: T, body: { title: `flow-i09 case ${n}`, steps: [{ action: 'Do it', expected: 'It works' }] } });
  const run = (await api_(`${O()}/test-runs`, { method: 'POST', token: T, body: { project_id: full.id, name: `${NAME} run`, suite_ids: [state.suite.id] } })).json;
  for (const [i, result] of ['pass', 'pass', 'fail'].entries()) {
    await api_(`${O()}/test-runs/${run.id}/results/${run.results[i].id}`, { method: 'PATCH', token: T, body: { result, ...(result === 'fail' ? { failed_step_index: 0 } : {}) } });
  }
  state.release = (await api_(`${O()}/releases`, { method: 'POST', token: T, body: { project_id: full.id, name: `${NAME} 2.4.0` } })).json;
  await api_(`${O()}/releases/${state.release.id}/bugs`, { method: 'POST', token: T, body: { bug_ids: [critical.id] } });
  await api_(`${O()}/releases/${state.release.id}/runs`, { method: 'POST', token: T, body: { run_ids: [run.id] } });
  log(`projects ${full.key} (3 open bugs, 1 finished, a run at 67%, a Blocked release) and ${bare.key} (nothing)`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    page.on('pageerror', (e) => log(`page error: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') log(`console error: ${m.text().slice(0, 300)}`); });
    await signIn(page, lead.email);
    const num = async (cap) => (await page.locator('.readout > div', { hasText: cap }).locator('.num').innerText()).trim();

    // 1. The dashboard for the data project
    await page.goto(`${BASE}/o/lumen/dashboard`);
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor().catch(async (e) => {
      log(`url ${page.url()}; body: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`);
      throw e;
    });
    await page.waitForSelector('.readout');
    await page.selectOption('#d-proj', { label: `${NAME} data` });
    await page.waitForFunction(() => document.querySelector('.readout')?.textContent?.includes('67%') ?? false);
    check((await num('Open bugs')) === '3', 'open bugs is not 3');
    check((await page.locator('.readout > div', { hasText: 'Open bugs' }).innerText()).includes('1 resolved or closed'), 'the finished count is not 1');
    check((await num('Open Critical')) === '1' && (await page.locator('.readout > div', { hasText: 'Open Critical' }).innerText()).includes('1 not triaged yet'), 'open Critical is not 1 with 1 not triaged');
    check((await num('Past SLA')) === '0', 'past SLA is not 0');
    check((await num('Run pass rate')) === '67%', `the pass rate is ${await num('Run pass rate')} (API says ${JSON.stringify((await api_(`${O()}/dashboard?project_id=${full.id}`, { token: T })).json?.pass_rate)}; run results ${JSON.stringify(run.results.map((r) => r.result))})`);
    const bars = await page.locator('.panel', { hasText: 'Open bugs by severity' }).locator('.hbar .v').allInnerTexts();
    check(bars.join(',') === '1,1,1,0', `severity bars: ${bars}`);
    const comps = await page.locator('.panel', { hasText: 'Components with most open bugs' }).locator('.hbar').allInnerTexts();
    check(comps.length === 1 && comps[0].includes('Checkout') && comps[0].includes('3'), `components: ${comps}`);
    const rel = page.locator('.panel', { hasText: 'Release readiness' }).locator('tr', { hasText: `${NAME} 2.4.0` });
    await rel.waitFor();
    check((await rel.innerText()).includes('Blocked') && (await rel.innerText()).includes('1 open Critical bug'), 'the release row does not say Blocked with its first reason');
    const today = await page.locator('.panel', { hasText: 'Opened and closed' }).locator('svg title').last().innerHTML();
    check(today.includes('4 opened') && today.includes('1 closed'), `the last day of the trend: ${today}`);
    log('dashboard: 3 open, 1 finished, 1 Critical not triaged, 67% pass rate, severity and component bars, the Blocked release and the trend add up');

    // 2. A project without bugs shows the empty state
    await page.selectOption('#d-proj', { label: `${NAME} bare` });
    await page.getByText('Nothing to measure yet').waitFor();
    check((await page.locator('.hbar').count()) === 0, 'an empty project still draws bars');
    await page.selectOption('#d-proj', '');
    await page.waitForSelector('.readout');
    log('the project select narrows the figures and a project without bugs shows the empty state, not zeros');

    // 3. Reports: ranges and the table view
    await page.goto(`${BASE}/o/lumen/reports`);
    await page.getByRole('heading', { name: 'Reports' }).waitFor();
    await page.selectOption('#rp-p', { label: `${NAME} data` });
    await page.locator('.panel', { hasText: 'Bugs by status' }).locator('.hbar').first().waitFor();
    // The panel first shows the previous figures (all projects) until the project's answer arrives: wait for it, then read
    await page.waitForFunction(() => {
      const p = [...document.querySelectorAll('.panel')].find((el) => el.textContent?.includes('Bugs by status'));
      return p?.querySelector('.hbar .v')?.textContent === '3';
    }, undefined, { timeout: 15000 }).catch(() => {});
    const statuses = await page.locator('.panel', { hasText: 'Bugs by status' }).locator('.hbar .v').allInnerTexts();
    check(statuses.length === 9 && statuses[0] === '3' && statuses[5] === '1', `bugs by status: ${statuses}`);
    const people = await page.locator('.panel', { hasText: 'Open bugs per person' }).locator('tbody tr').allInnerTexts();
    check(people.some((p) => p.includes(dev.full_name)) && people[people.length - 1].startsWith('Unassigned'), `open bugs per person: ${people}`);
    await page.locator('.panel', { hasText: 'Pass rate per run' }).locator('svg title', { hasText: '67% pass' }).first().waitFor({ state: 'attached' });
    await page.selectOption('#rp-r', 'custom');
    await fillStable(page, '#rp-f', '2024-01-01');
    await fillStable(page, '#rp-t', '2026-01-01');
    await page.getByText('Pick at most 366 days.').waitFor();
    await fillStable(page, '#rp-t', '2023-01-01');
    await page.getByText('The end date is before the start date.').waitFor();
    await page.selectOption('#rp-r', '7');
    await page.locator('details summary', { hasText: 'Show as table' }).first().click();
    log('reports: bugs by status, open bugs per person with Unassigned last, pass rate per run, the 366 day and end before start messages');

    // 4. CSV export
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    check(download.suggestedFilename() === 'bugs.csv', `the download is named ${download.suggestedFilename()}`);
    const text = readFileSync(await download.path(), 'utf8');
    check(text.startsWith('Key,Title,Status,Severity,Priority,Component,Environment,Assignee,Reporter,Release,Created,Updated'), 'the CSV header is wrong');
    check(text.includes(`${NAME} critical bug`) && text.includes(`'=HYPERLINK`) && !text.includes(',=HYPERLINK'), 'the CSV does not carry the bugs or the formula is not quoted');
    check(text.includes(`${NAME} 2.4.0`), 'the CSV does not name the release of the Critical bug');
    log('CSV: bugs.csv with the header, the fixture bugs, the release name and the formula quoted');
    await ctx.close();

    // 5. The Developer sees their own bugs
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d = await dctx.newPage();
    d.setDefaultTimeout(30_000);
    await signIn(d, dev.email);
    await d.goto(`${BASE}/o/lumen/dashboard`);
    await d.getByRole('heading', { name: 'Assigned to you' }).waitFor();
    await d.locator('.panel', { hasText: 'Assigned to you' }).locator('tr', { hasText: `${NAME} high bug` }).waitFor();
    log('Developer: the dashboard says how many open bugs are assigned and lists them');
    await dctx.close();

    // 6. The Viewer reads both screens
    const vctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const v = await vctx.newPage();
    v.setDefaultTimeout(30_000);
    await signIn(v, viewer.email);
    await v.goto(`${BASE}/o/lumen/dashboard`);
    await v.waitForSelector('.readout');
    await v.goto(`${BASE}/o/lumen/reports`);
    await v.getByRole('button', { name: 'Export CSV' }).waitFor();
    await vctx.close();
    log('Viewer: reads the dashboard and the reports and may export');
  } finally {
    await browser.close();
  }
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error(`flow-i09: FAIL ${e.message}`);
}
try { await cleanup(); } catch (e) { failed = true; console.error(`flow-i09: cleanup failed: ${e.message}`); }
if (failed) process.exitCode = 1;
else console.log('flow-i09: PASS');
