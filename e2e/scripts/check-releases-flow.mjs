// I-08 acceptance flow: releases (SCR-16, SCR-17): plan a release, link bugs and a run, watch the readiness and its reasons change
// (Blocked with two reasons), remove a link, mark it released, the release select on the bug page, delete, and the read only views.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-releases-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: one project (key U + 4 letters, name "flow-i08-<timestamp>") with a suite of three cases, three bugs, one run and releases
// named "flow-i08 ...". Cleanup in `finally`: bugs and the second release are deleted, the suite is deleted and the project archived. A
// released release and a run cannot be deleted in v1 (BL-027), so the released fixture release and the run stay under their flow-i08 names.
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
const PROJECT_NAME = `flow-i08-${RUN}`;
const PROJECT_KEY = `U${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const RELEASE_NAME = `flow-i08 ${RUN} 2.4.0`;
const log = (m) => console.log(`flow-i08: ${m}`);
const check = (c, m) => { if (!c) throw new Error(m); };

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
  await page.waitForURL('**/o/*/dashboard'); // a person in two workspaces may land in the other one; every step goes to /o/lumen itself
}

const state = { orgId: '', project: null, suite: null, bugs: [], releases: [], leadToken: '' };
const O = () => `/orgs/${state.orgId}`;

async function cleanup() {
  const notes = [];
  for (const b of state.bugs) notes.push(`bug ${b.key} deleted (${(await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  for (const r of state.releases) {
    const res = await api(`${O()}/releases/${r.id}`, { method: 'DELETE', token: state.leadToken });
    notes.push(`release ${r.name.slice(-10)} ${res.status === 409 ? 'stays (released)' : `deleted (${res.status})`}`);
  }
  if (state.suite) notes.push(`suite deleted (${(await api(`${O()}/test-suites/${state.suite.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.project) notes.push(`project archived (${(await api(`${O()}/projects/${state.project.id}`, { method: 'PATCH', token: state.leadToken, body: { archived: true } })).status})`);
  log(`cleanup: ${notes.join(', ')}`);
}

async function main() {
  const adminToken = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: adminToken });
  state.orgId = orgs.json.find((o) => o.org.slug === 'lumen').org.id;
  const members = (await api(`${O()}/members?page_size=100`, { token: adminToken })).json.items;
  const person = (role) => members.find((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test'))?.user;
  const lead = person('qa_lead'); const dev = person('developer'); const viewer = person('viewer');
  check(lead && dev && viewer, 'the baseline seed has no QA Lead, Developer or Viewer');
  state.leadToken = await login(lead.email);
  const T = state.leadToken;

  state.project = (await api(`${O()}/projects`, { method: 'POST', token: T, body: { name: PROJECT_NAME, key: PROJECT_KEY } })).json;
  check(state.project?.id, 'could not create the project');
  state.suite = (await api(`${O()}/test-suites`, { method: 'POST', token: T, body: { project_id: state.project.id, name: 'flow-i08 suite' } })).json;
  for (const n of [1, 2, 3]) {
    await api(`${O()}/test-suites/${state.suite.id}/cases`, { method: 'POST', token: T, body: { title: `flow-i08 case ${n}`, steps: [{ action: 'Do it', expected: 'It works' }] } });
  }
  const bug = async (title, severity) => {
    const r = await api(`${O()}/bugs`, { method: 'POST', token: T, body: { project_id: state.project.id, title: `flow-i08 ${title}`, severity } });
    check(r.status === 201, `could not create ${title}: ${r.status}`);
    state.bugs.push(r.json);
    return r.json;
  };
  const critical = await bug('critical checkout bug', 'critical');
  const high = await bug('high payment bug', 'high');
  const low = await bug('low tooltip bug', 'low');
  const run = (await api(`${O()}/test-runs`, { method: 'POST', token: T, body: { project_id: state.project.id, name: 'flow-i08 regression run', suite_ids: [state.suite.id] } })).json;
  check(run?.id, 'could not start the run');
  for (const [i, result] of ['pass', 'fail', 'blocked'].entries()) {
    await api(`${O()}/test-runs/${run.id}/results/${run.results[i].id}`, { method: 'PATCH', token: T, body: { result, ...(result === 'fail' ? { failed_step_index: 0 } : {}) } });
  }
  log(`project ${PROJECT_KEY} with bugs ${critical.key}, ${high.key} and ${low.key} and the run ${run.key} (1 pass, 1 fail, 1 blocked)`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await signIn(page, lead.email);
    const toast = (text) => page.locator('#toasts').getByText(text, { exact: false }).first();
    const badge = () => page.locator('.page-head h1 .badge');
    const reasons = async () => (await page.locator('section.panel', { hasText: /^Why it is/ }).locator('li').allInnerTexts()).map((t) => t.trim());

    // 1. Plan a release
    await page.goto(`${BASE}/o/lumen/releases`);
    await page.getByRole('heading', { name: 'Releases' }).waitFor();
    await page.getByRole('button', { name: 'New release' }).first().click();
    await page.waitForSelector('.modal');
    await page.selectOption('#rl-p', { label: PROJECT_NAME });
    await page.getByRole('button', { name: 'Plan release' }).click();
    await page.getByText('Name must be at least 2 characters.').waitFor();
    await fillStable(page, '#rl-n', RELEASE_NAME);
    await page.fill('#rl-t', '2026-12-24');
    await page.fill('#rl-d', 'The flow release');
    await page.getByRole('button', { name: 'Plan release' }).click();
    await toast('planned').waitFor(); // before the page loads: a cold dev server can take longer than the toast stays
    await page.waitForURL(/\/o\/lumen\/releases\/[0-9a-f-]{36}$/);
    const releaseId = page.url().split('/').pop();
    state.releases.push({ id: releaseId, name: RELEASE_NAME });
    await page.getByRole('heading', { name: RELEASE_NAME }).waitFor();
    check((await badge().innerText()).trim() === 'At risk', 'a new release is not At risk');
    check((await reasons()).join('|') === 'No test runs linked', `the reasons of a new release: ${await reasons()}`);
    check((await page.locator('.page-head p').innerText()).includes('24 Dec 2026'), 'the target date is not shown as 24 Dec 2026');
    log('new release: the name is validated, planned, At risk because no runs are linked');

    // 2. Link bugs: the Critical and the High one
    await page.getByRole('button', { name: 'Link bugs' }).click();
    await page.waitForSelector('.modal');
    await page.getByRole('button', { name: new RegExp(`${critical.key}`) }).click();
    await page.getByRole('button', { name: new RegExp(`${high.key}`) }).click();
    await page.getByRole('button', { name: 'Link 2 bugs' }).click();
    await toast('2 bugs linked').waitFor();
    await page.locator('table tr', { hasText: critical.key }).waitFor();
    await page.locator('.page-head h1 .badge.blocked').waitFor();
    check((await reasons()).join('|') === '1 open Critical bug|1 open High bug|No test runs linked', `the reasons after linking the bugs: ${await reasons()}`);
    log('link bugs: two linked, Blocked by the open Critical bug, the High bug and "no runs" listed after it');

    // 3. Link the run: pass rate 33%, in progress
    await page.getByRole('button', { name: 'Link run' }).click();
    await page.waitForSelector('.modal');
    await page.getByRole('button', { name: new RegExp(run.key) }).click();
    await page.getByRole('button', { name: 'Link 1 run' }).click();
    await toast('1 run linked').waitFor();
    await page.locator('section.panel', { hasText: 'Linked test runs' }).getByRole('link', { name: 'flow-i08 regression run' }).waitFor();
    const lines = await reasons();
    check(lines[0] === '1 open Critical bug' && lines[1] === 'Pass rate 33% is below 80%', `two blocking reasons expected first, got ${lines}`);
    check(lines.includes('1 open High bug') && lines.includes('1 run still in progress'), `the risks are missing: ${lines}`);
    log('link run: Blocked with two blocking reasons (open Critical bug, pass rate 33% below 80%) and the risks after them');

    // 4. Remove the Critical bug: the blocking bug reason goes
    await page.getByRole('button', { name: `Remove ${critical.key} from the release` }).click();
    await toast('Bug removed from the release').waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('1 open Critical bug'));
    check((await reasons())[0] === 'Pass rate 33% is below 80%', `after removing the Critical bug: ${await reasons()}`);
    check((await api(`${O()}/bugs/${critical.id}`, { token: T })).json.release_id === null, 'the bug still has the release');
    log('remove: the Critical bug leaves the release and its reason with it');

    // 5. The release select on the bug page
    await page.goto(`${BASE}/o/lumen/bugs/${high.key}`);
    await page.waitForSelector('#d-rel');
    check((await page.locator('#d-rel option:checked').innerText()) === RELEASE_NAME, 'the bug page does not show the release');
    const serverRelease = async () => (await api(`${O()}/bugs/${high.id}`, { token: T })).json.release_id;
    const eventually = async (want, message) => { // the save is a request: give the server a moment
      for (let i = 0; i < 30 && (await serverRelease()) !== want; i++) await page.waitForTimeout(300);
      check((await serverRelease()) === want, message);
    };
    await page.selectOption('#d-rel', '');
    await eventually(null, 'the release was not cleared');
    await page.locator('.dl a', { hasText: 'Open the release' }).waitFor({ state: 'detached' });
    await page.selectOption('#d-rel', releaseId);
    await eventually(releaseId, 'the release was not set again');
    await page.locator('.dl a', { hasText: 'Open the release' }).waitFor();
    log('bug page: the Release select shows the release, clears it and sets it again, with a link to the release');

    // 6. The run shows its release, and the list shows the readiness
    await page.goto(`${BASE}/o/lumen/runs/${run.key}`);
    await page.getByRole('link', { name: RELEASE_NAME }).waitFor();
    await page.goto(`${BASE}/o/lumen/releases`);
    const row = page.locator('tr', { hasText: RELEASE_NAME });
    await row.waitFor();
    check((await row.innerText()).includes('Blocked') && (await row.innerText()).includes('Pass rate 33% is below 80%'), 'the list row does not show Blocked and its reason');
    log('the run names its release and the list shows Blocked with the reason');

    // 7. Mark released: a Blocked release warns, Cancel keeps it, Mark released confirms
    await page.goto(`${BASE}/o/lumen/releases/${releaseId}`);
    await page.getByRole('button', { name: 'Mark released' }).first().click();
    await page.getByText('This release is blocked.').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    check((await api(`${O()}/releases/${releaseId}`, { token: T })).json.status === 'planned', 'Cancel released it');
    await page.getByRole('button', { name: 'Mark released' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark released' }).click();
    await toast('marked as released').waitFor();
    await page.getByText('Released.').first().waitFor();
    check((await page.getByRole('button', { name: 'Mark released' }).count()) === 0 && (await page.getByRole('button', { name: 'Delete release' }).count()) === 0, 'a released release can still be released again or deleted');
    const done = (await api(`${O()}/releases/${releaseId}`, { token: T })).json;
    check(done.status === 'released' && done.released_at, 'the server does not have the release as released');
    log('mark released: the warning names it Blocked, Cancel keeps it, confirming releases it and removes Mark released and Delete');

    // 8. Edit and delete a second release
    const second = (await api(`${O()}/releases`, { method: 'POST', token: T, body: { project_id: state.project.id, name: `${RELEASE_NAME} second` } })).json;
    state.releases.push({ id: second.id, name: second.name });
    await page.goto(`${BASE}/o/lumen/releases/${second.id}`);
    await page.getByRole('button', { name: 'Edit release' }).click();
    await fillStable(page, '#rl-n', `${RELEASE_NAME} renamed`);
    await page.getByRole('button', { name: 'Save release' }).click();
    await toast('saved').waitFor();
    await page.getByRole('heading', { name: `${RELEASE_NAME} renamed` }).waitFor();
    await page.getByRole('button', { name: 'Delete release' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    check((await api(`${O()}/releases/${second.id}`, { token: T })).status === 200, 'Cancel deleted the release');
    await page.getByRole('button', { name: 'Delete release' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete release' }).click();
    await page.waitForURL('**/o/lumen/releases');
    check((await api(`${O()}/releases/${second.id}`, { token: T })).status === 404, 'the release was not deleted');
    state.releases.pop();
    log('edit and delete: renamed, Cancel keeps it, Delete removes it and returns to the list');
    await ctx.close();

    // 9. Developer and Viewer: read only
    for (const [label, who] of [['Developer', dev], ['Viewer', viewer]]) {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await c.newPage();
      p.setDefaultTimeout(30_000);
      await signIn(p, who.email);
      await p.goto(`${BASE}/o/lumen/releases`);
      await p.locator('tr', { hasText: RELEASE_NAME }).waitFor();
      check((await p.getByRole('button', { name: 'New release' }).count()) === 0, `a ${label} sees New release`);
      await p.goto(`${BASE}/o/lumen/releases/${releaseId}`);
      await p.getByRole('heading', { name: RELEASE_NAME }).waitFor();
      check((await p.locator('.page-head .actions button, button:has-text("Remove")').count()) === 0, `a ${label} sees release controls`);
      await c.close();
    }
    log('Developer and Viewer: the list and the release are readable, with no New release, link, release, edit, delete or Remove controls');

    // 10. A release that does not exist
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await c2.newPage();
    p2.setDefaultTimeout(30_000);
    await signIn(p2, lead.email);
    await p2.goto(`${BASE}/o/lumen/releases/00000000-0000-4000-8000-000000000000`);
    await p2.getByText('This release was not found').waitFor();
    await c2.close();
    log('an unknown release shows the not found state');
  } finally {
    await browser.close();
  }
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error(`flow-i08: FAIL ${e.message}`);
}
try { await cleanup(); } catch (e) { failed = true; console.error(`flow-i08: cleanup failed: ${e.message}`); }
if (failed) process.exitCode = 1;
else console.log('flow-i08: PASS');
