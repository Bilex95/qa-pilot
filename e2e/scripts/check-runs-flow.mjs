// I-07 acceptance flow: test runs (SCR-14, SCR-15): start a run, set results, fail a case at step 3, create the bug from the failed step,
// see its link back to the run and its environment, complete the run, and the read only views of the Developer and the Viewer.
//
// Usage (stack up, baseline seeded):
//   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\e2e.ps1 check-runs-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: one project (key W + 4 letters, name "flow-i07-<timestamp>") with one suite of two cases and one run named
// "flow-i07 run <timestamp>". Cleanup in `finally`: the bug is deleted, the suite (and its cases) is deleted and the project is archived.
// A run itself cannot be deleted in v1 (BL-027), so the completed fixture run stays in the list under its flow-i07 name.
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
const PROJECT_NAME = `flow-i07-${RUN}`;
const PROJECT_KEY = `W${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const RUN_NAME = `flow-i07 run ${RUN}`;
const log = (m) => console.log(`flow-i07: ${m}`);
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

const state = { orgId: '', project: null, suite: null, bugs: [], leadToken: '' };
const O = () => `/orgs/${state.orgId}`;

async function cleanup() {
  const notes = [];
  for (const b of state.bugs) notes.push(`bug ${b.key} deleted (${(await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.project) {
    const bugs = await api(`${O()}/bugs?project_id=${state.project.id}&page_size=100`, { token: state.leadToken });
    for (const b of bugs.json?.items ?? []) if (!state.bugs.some((x) => x.id === b.id)) await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken });
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
  const lead = person('qa_lead'); const qa = person('qa_engineer'); const dev = person('developer'); const viewer = person('viewer');
  check(lead && qa && dev && viewer, 'the baseline seed has no QA Lead, QA Engineer, Developer or Viewer');
  state.leadToken = await login(lead.email);

  state.project = (await api(`${O()}/projects`, { method: 'POST', token: state.leadToken, body: { name: PROJECT_NAME, key: PROJECT_KEY } })).json;
  check(state.project?.id, 'could not create the project');
  const envs = (await api(`${O()}/projects/${state.project.id}/environments`, { token: state.leadToken })).json;
  const env = envs.find((e) => e.name === 'staging') ?? envs[0];
  const comp = (await api(`${O()}/projects/${state.project.id}/components`, { method: 'POST', token: state.leadToken, body: { name: 'Checkout' } })).json;
  state.suite = (await api(`${O()}/test-suites`, { method: 'POST', token: state.leadToken, body: { project_id: state.project.id, name: 'flow-i07 checkout', component_id: comp.id } })).json;
  const step = (i) => ({ action: `Action ${i} of the flow`, expected: `Expected ${i} of the flow` });
  const caseOne = (await api(`${O()}/test-suites/${state.suite.id}/cases`, { method: 'POST', token: state.leadToken,
    body: { title: 'flow-i07 apply a discount code', steps: [1, 2, 3, 4].map(step), preconditions: 'A cart with a parcel' } })).json;
  const caseTwo = (await api(`${O()}/test-suites/${state.suite.id}/cases`, { method: 'POST', token: state.leadToken,
    body: { title: 'flow-i07 change the address', steps: [1, 2].map(step) } })).json;
  check(caseOne?.id && caseTwo?.id, 'could not create the cases');
  log(`project ${PROJECT_KEY} with a suite of ${caseOne.key} and ${caseTwo.key}`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await signIn(page, qa.email);
    const toast = (text) => page.locator('#toasts').getByText(text, { exact: false }).first();

    // 1. Start a run from the dialog
    await page.goto(`${BASE}/o/lumen/runs`);
    await page.getByRole('heading', { name: 'Test runs' }).waitFor();
    await page.getByRole('button', { name: 'New test run' }).first().click();
    await page.waitForSelector('.modal');
    await page.selectOption('#nr-p', { label: PROJECT_NAME });
    await page.getByRole('button', { name: /^Start run with/ }).click(); // nothing filled in
    await page.getByText('Name must be at least 3 characters.').waitFor();
    await page.getByText('Choose at least one suite that has cases.').waitFor();
    await page.fill('#nr-n', RUN_NAME);
    await page.selectOption('#nr-e', { label: env.name });
    await page.getByRole('button', { name: 'flow-i07 checkout (2 cases)' }).click();
    await page.getByRole('button', { name: 'Start run with 2 cases' }).click();
    await page.waitForURL(/\/o\/lumen\/runs\/R-\d+$/);
    const runKey = page.url().split('/').pop();
    await toast(`Run ${runKey} started`).waitFor();
    await page.getByRole('heading', { name: RUN_NAME }).waitFor();
    check((await page.locator('.readout .num').first().innerText()) === 'n/a', 'the pass rate of a new run is not n/a');
    check((await page.locator('.case-row').count()) === 2, 'the run does not have two cases');
    log(`new run: validation messages, started ${runKey} with two cases, pass rate n/a`);

    // 2. Results: pass the second case, fail the first one at step 3
    const row = (key) => page.locator(`.case-row[data-case="${key}"]`);
    await row(caseTwo.key).getByRole('button', { name: 'Pass', exact: true }).click();
    await row(caseTwo.key).locator('.res-pass').waitFor();
    await row(caseOne.key).getByRole('button', { name: 'Fail', exact: true }).click();
    await row(caseOne.key).locator('.res-fail').waitFor();
    if (!(await row(caseOne.key).locator('.case-detail').count())) await row(caseOne.key).locator('.expander').click();
    await page.selectOption(`#fs-${caseOne.key}`, '2'); // Step 3
    await row(caseOne.key).locator('tr.failed').waitFor();
    check((await row(caseOne.key).locator('tr.failed .mono').innerText()) === '3', 'step 3 is not the failed row');
    await page.fill(`#fa-${caseOne.key}`, 'Total went up by 4.20');
    await page.locator(`#fa-${caseOne.key}`).blur();
    await page.waitForTimeout(800);
    const live = (await api(`${O()}/test-runs/${runKey}`, { token: state.leadToken })).json;
    const failedResult = live.results.find((r) => r.case_key === caseOne.key);
    check(failedResult.result === 'fail' && failedResult.failed_step_index === 2 && failedResult.actual_result === 'Total went up by 4.20', 'the server does not have the failed step and the actual result');
    check((await page.locator('.readout .num').first().innerText()) === '50%', 'the pass rate is not 50%');
    log('results: pass and fail saved, failed at step 3 with the actual result, pass rate 50%');

    // 3. Create the bug from the failed step
    await row(caseOne.key).getByRole('link', { name: 'Create bug from failed step' }).click();
    await page.waitForURL(/\/bugs\/new\?from_run=/);
    await page.getByText('Prefilled from a failed step of').waitFor();
    check((await page.inputValue('#n-title')) === 'flow-i07 apply a discount code fails at step 3', `the title is "${await page.inputValue('#n-title')}"`);
    check((await page.locator('input[aria-label^="Step "]').count()) === 3, 'the bug does not have three steps');
    check((await page.inputValue('#n-act')) === 'Total went up by 4.20', 'the actual result is not prefilled');
    check((await page.inputValue('#n-exp')) === 'Expected 3 of the flow', 'the expected result is not the one of step 3');
    check((await page.locator('#n-env option:checked').innerText()) === env.name, 'the environment is not prefilled');
    check((await page.locator('#n-comp option:checked').innerText()) === 'Checkout', 'the component is not prefilled');
    check((await api(`${O()}/bugs?project_id=${state.project.id}`, { token: state.leadToken })).json.total === 0, 'the draft saved a bug before Save');
    await page.getByRole('button', { name: 'Save bug' }).click();
    await page.waitForURL(/\/o\/lumen\/bugs\/[A-Z]+-\d+$/);
    const bugKey = page.url().split('/').pop();
    state.bugs.push((await api(`${O()}/bugs/${bugKey}`, { token: state.leadToken })).json);
    await page.getByText('Found in').waitFor();
    check((await page.locator('.dl').getByRole('link', { name: runKey }).count()) === 1, 'the bug does not link to the run');
    check((await page.locator('#d-env option:checked').innerText()) === env.name, 'the bug does not show the environment of the run');
    log(`bug from the failed step: prefilled and not saved until Save, ${bugKey} shows "Found in ${runKey}" and the environment ${env.name}`);

    // 4. Back to the run: the linked bug shows, then complete the run
    await page.locator('.dl').getByRole('link', { name: runKey }).click();
    await page.waitForURL(/\/runs\/R-\d+$/);
    await page.locator(`.case-row[data-case="${caseOne.key}"]`).getByRole('link', { name: bugKey }).waitFor();
    check((await page.getByRole('link', { name: 'Create bug from failed step' }).count()) === 0, 'a failed case with a bug still offers a second bug');
    await page.getByRole('button', { name: 'Complete run' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    check((await api(`${O()}/test-runs/${runKey}`, { token: state.leadToken })).json.status === 'in_progress', 'Cancel completed the run');
    await page.getByRole('button', { name: 'Complete run' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Complete run' }).click();
    await toast('Run completed').waitFor();
    await page.getByText('Completed on').waitFor();
    check((await page.locator('.result-btns').count()) === 0 && (await page.getByRole('button', { name: 'Complete run' }).count()) === 0, 'a completed run still has controls');
    const late = await api(`${O()}/test-runs/${live.id}/results/${failedResult.id}`, { method: 'PATCH', token: state.leadToken, body: { result: 'pass' } });
    check(late.status === 409 && late.json.error.code === 'run_completed', `a result of a completed run changed: ${late.status}`);
    log('run page: the linked bug shows, Cancel keeps the run open, Complete run makes it read only (the API answers 409)');

    // 5. The list shows it
    await page.goto(`${BASE}/o/lumen/runs`);
    const listed = page.locator('tr', { hasText: RUN_NAME });
    await listed.waitFor();
    check((await listed.innerText()).includes('Completed') && (await listed.innerText()).includes('50%') && (await listed.innerText()).includes('2 of 2 executed'), 'the list row does not show Completed, 50% and 2 of 2 executed');
    await ctx.close();

    // 6. Developer and Viewer: read only
    for (const [label, who] of [['Developer', dev], ['Viewer', viewer]]) {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await c.newPage();
      p.setDefaultTimeout(30_000);
      await signIn(p, who.email);
      await p.goto(`${BASE}/o/lumen/runs`);
      await p.locator('tr', { hasText: RUN_NAME }).waitFor();
      check((await p.getByRole('button', { name: 'New test run' }).count()) === 0, `a ${label} sees New test run`);
      await p.goto(`${BASE}/o/lumen/runs/${runKey}`);
      await p.getByRole('heading', { name: RUN_NAME }).waitFor();
      check((await p.locator('.result-btns, button:has-text("Complete run"), a:has-text("Create bug from failed step")').count()) === 0, `a ${label} sees run controls`);
      await c.close();
    }
    log('Developer and Viewer: the list and the run are readable, with no New test run and no result or bug controls');

    // 7. A run that does not exist
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await c2.newPage();
    p2.setDefaultTimeout(30_000);
    await signIn(p2, qa.email);
    await p2.goto(`${BASE}/o/lumen/runs/R-999999`);
    await p2.getByText('Run R-999999 was not found').waitFor();
    await c2.close();
    log('an unknown run shows the not found state');
  } finally {
    await browser.close();
  }
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error(`flow-i07: FAIL ${e.message}`);
}
try { await cleanup(); } catch (e) { failed = true; console.error(`flow-i07: cleanup failed: ${e.message}`); }
if (failed) process.exitCode = 1;
else console.log('flow-i07: PASS');
