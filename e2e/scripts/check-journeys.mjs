// I-20 critical journeys, one script, real browser against the running stack (REQ-055 to REQ-058):
//   1. Sign in as each of the five roles (and a wrong password is refused)
//   2. Report a bug with the AI Bug Writer (Accept, Save)
//   3. Triage it with AI (Accept) and move it on the board (keyboard, Move to)
//   4. Run a test, fail a step, create a bug from the failed step
//   5. Release summary: a lead drafts and publishes, a Viewer reads it
//   6. A Viewer cannot edit (bug, board, new bug, new run)
//   7. Workspace A cannot see workspace B (and the other way round)
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-journeys.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: one project (key Y + 4 letters, "journey-<timestamp>") with a component, a suite of two cases and a release. Cleanup in `finally`.
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
const KEY = `Y${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const NAME = `journey-${RUN}`;
const NOTES = 'Checkout crashes when I press Pay in prod\n1. Open the cart\n2. Press Pay';
const log = (m) => console.log(`journeys: ${m}`);
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
async function signIn(page, email, password = PW) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', password);
  await page.click('button[type=submit]');
}
async function eventually(fn, message, tries = 20) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(message);
}

const state = { orgId: '', project: null, suite: null, release: null, leadToken: '', bugs: [] };
const O = () => `/orgs/${state.orgId}`;

async function cleanup() {
  const notes = [];
  if (!state.leadToken) return;
  if (state.release) notes.push(`release deleted (${(await api(`${O()}/releases/${state.release.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.project) {
    const bugs = (await api(`${O()}/bugs?project_id=${state.project.id}&page_size=100`, { token: state.leadToken })).json?.items ?? [];
    for (const b of bugs) await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken });
    notes.push(`${bugs.length} bug(s) deleted`);
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
  const admin = person('org_admin'); const lead = person('qa_lead'); const qa = person('qa_engineer'); const dev = person('developer'); const viewer = person('viewer');
  check(admin && lead && qa && dev && viewer, 'the baseline seed lacks one of the five roles');
  state.leadToken = await login(lead.email);
  const T = state.leadToken;

  state.project = (await api(`${O()}/projects`, { method: 'POST', token: T, body: { name: NAME, key: KEY } })).json;
  check(state.project?.id, 'could not create the project');
  const envs = (await api(`${O()}/projects/${state.project.id}/environments`, { token: T })).json;
  const env = envs.find((e) => e.name === 'staging') ?? envs[0];
  const comp = (await api(`${O()}/projects/${state.project.id}/components`, { method: 'POST', token: T, body: { name: 'Checkout' } })).json;
  state.suite = (await api(`${O()}/test-suites`, { method: 'POST', token: T, body: { project_id: state.project.id, name: 'journey checkout', component_id: comp.id } })).json;
  const step = (i) => ({ action: `Action ${i} of the journey`, expected: `Expected ${i} of the journey` });
  const caseOne = (await api(`${O()}/test-suites/${state.suite.id}/cases`, { method: 'POST', token: T, body: { title: 'journey apply a discount code', steps: [1, 2, 3].map(step) } })).json;
  const caseTwo = (await api(`${O()}/test-suites/${state.suite.id}/cases`, { method: 'POST', token: T, body: { title: 'journey change the address', steps: [1, 2].map(step) } })).json;
  check(caseOne?.id && caseTwo?.id, 'could not create the cases');
  log(`project ${KEY} with a suite of two cases`);

  const browser = await chromium.launch();
  const open = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await signIn(page, email);
    await page.waitForURL('**/o/*/dashboard');
    return { ctx, page };
  };
  try {
    // 1. Sign in per role
    for (const [role, who] of [['Org Admin', admin], ['QA Lead', lead], ['QA Engineer', qa], ['Developer', dev], ['Viewer', viewer]]) {
      const { ctx, page } = await open(who.email);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      check(/\/o\/[^/]+\/dashboard/.test(page.url()), `${role} did not land on a dashboard`);
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30_000);
      await signIn(page, qa.email, `${PW}-wrong`);
      await page.getByText('Email or password is incorrect', { exact: false }).first().waitFor();
      check(page.url().includes('/login'), 'a wrong password left the sign in screen');
      await ctx.close();
    }
    log('sign in: all five roles reach the dashboard, a wrong password is refused');

    // 2. Report a bug with the AI Bug Writer
    const q = await open(qa.email);
    const page = q.page;
    const toast = (p, text) => p.locator('#toasts').getByText(text, { exact: false }).first();
    await page.goto(`${BASE}/o/lumen/bugs/new`);
    await page.getByRole('heading', { name: 'Report a bug' }).waitFor();
    await page.selectOption('#n-proj', { label: NAME });
    await page.waitForSelector('#n-env option:has-text("prod")', { state: 'attached' });
    await page.waitForSelector('#n-comp option:has-text("Checkout")', { state: 'attached' });
    await fillStable(page, '#w-notes', NOTES);
    await page.getByRole('button', { name: 'Write the report' }).click();
    await page.locator('.suggest', { hasText: 'AI suggestion, not saved' }).waitFor();
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('button', { name: 'Save bug' }).click();
    await page.waitForURL(/\/o\/lumen\/bugs$/);
    const reported = (await api(`${O()}/bugs?project_id=${state.project.id}&page_size=100`, { token: T })).json.items.find((b) => b.title.startsWith('Checkout crashes'));
    check(reported, 'the AI drafted bug was not saved');
    state.bugs.push(reported);
    const full = (await api(`${O()}/bugs/${reported.id}`, { token: T })).json;
    check(full.ai_assisted === true && full.status === 'new', 'the saved bug is not AI assisted and New');
    log(`report with AI: ${reported.key} saved as AI assisted`);

    // 3. Triage it with AI, then move it on the board
    const l = await open(lead.email);
    await l.page.goto(`${BASE}/o/lumen/bugs/${reported.key}`);
    await l.page.getByRole('heading', { name: 'AI triage' }).waitFor();
    await l.page.getByRole('button', { name: 'Suggest triage' }).click();
    await l.page.locator('.ai-panel .suggest', { hasText: 'AI suggestion, not saved' }).waitFor();
    await l.page.locator('.ai-panel').getByRole('button', { name: 'Accept' }).click();
    await toast(l.page, 'Triage applied').waitFor();
    await eventually(async () => (await api(`${O()}/bugs/${reported.id}`, { token: T })).json.priority === 'p1', 'the triage was not applied');
    await l.page.goto(`${BASE}/o/lumen/board?project=${state.project.id}`);
    const card = l.page.locator(`article.card[data-key="${reported.key}"]`);
    await card.waitFor();
    await card.locator('button[aria-label^="Move"]').focus();
    await l.page.keyboard.press('Enter');
    await l.page.getByRole('menuitem', { name: 'Triaged', exact: true }).click();
    await toast(l.page, `${reported.key} moved to Triaged`).waitFor();
    await eventually(async () => (await api(`${O()}/bugs/${reported.id}`, { token: T })).json.status === 'triaged', 'the move was not saved');
    await l.page.locator('section.col[data-col="triaged"]').locator(`article.card[data-key="${reported.key}"]`).waitFor();
    log('triage and board: AI triage accepted, card moved to Triaged by keyboard and saved');
    await l.ctx.close();

    // 4. Run a test and create a bug from the failed step
    await page.goto(`${BASE}/o/lumen/runs`);
    await page.getByRole('heading', { name: 'Test runs' }).waitFor();
    await page.getByRole('button', { name: 'New test run' }).first().click();
    await page.waitForSelector('.modal');
    await page.selectOption('#nr-p', { label: NAME });
    await page.fill('#nr-n', `${NAME} run`);
    await page.selectOption('#nr-e', { label: env.name });
    await page.getByRole('button', { name: 'journey checkout (2 cases)' }).click();
    await page.getByRole('button', { name: 'Start run with 2 cases' }).click();
    await page.waitForURL(/\/o\/lumen\/runs\/R-\d+$/);
    const row = (key) => page.locator(`.case-row[data-case="${key}"]`);
    await row(caseTwo.key).getByRole('button', { name: 'Pass', exact: true }).click();
    await row(caseTwo.key).locator('.res-pass').waitFor();
    await row(caseOne.key).getByRole('button', { name: 'Fail', exact: true }).click();
    await row(caseOne.key).locator('.res-fail').waitFor();
    if (!(await row(caseOne.key).locator('.case-detail').count())) await row(caseOne.key).locator('.expander').click();
    await page.selectOption(`#fs-${caseOne.key}`, '2'); // Step 3
    await row(caseOne.key).locator('tr.failed').waitFor();
    await page.fill(`#fa-${caseOne.key}`, 'Total went up by 4.20');
    await page.locator(`#fa-${caseOne.key}`).blur();
    await page.waitForTimeout(800);
    await row(caseOne.key).getByRole('link', { name: 'Create bug from failed step' }).click();
    await page.waitForURL(/\/bugs\/new\?from_run=/);
    await page.getByText('Prefilled from a failed step of').waitFor();
    check((await page.inputValue('#n-title')) === 'journey apply a discount code fails at step 3', `the bug title is "${await page.inputValue('#n-title')}", not drawn from the failed step`);
    await page.getByRole('button', { name: 'Save bug' }).click();
    await page.waitForURL(/\/o\/lumen\/bugs\/[A-Z]+-\d+$/);
    const fromRun = (await api(`${O()}/bugs/${page.url().split('/').pop()}`, { token: T })).json;
    state.bugs.push(fromRun);
    check(fromRun.project_id === state.project.id, 'the bug from the failed step is in another project');
    log(`run: case failed at step 3, bug ${fromRun.key} created from it`);

    // 5. Release summary
    state.release = (await api(`${O()}/releases`, { method: 'POST', token: T, body: { project_id: state.project.id, name: `${NAME} release` } })).json;
    check(state.release?.id, 'could not create the release');
    await api(`${O()}/releases/${state.release.id}/bugs`, { method: 'POST', token: T, body: { bug_ids: [reported.id] } });
    const l2 = await open(lead.email);
    await l2.page.goto(`${BASE}/o/lumen/releases/${state.release.id}`);
    await l2.page.getByRole('heading', { name: 'Release Readiness Summary' }).waitFor();
    await l2.page.getByRole('button', { name: 'Draft summary' }).click();
    await l2.page.locator('.suggest', { hasText: 'AI suggestion, not saved' }).waitFor();
    await l2.page.getByRole('button', { name: 'Accept and publish' }).click();
    await toast(l2.page, 'Summary published').waitFor();
    await eventually(async () => !!(await api(`${O()}/releases/${state.release.id}`, { token: T })).json.ai_summary, 'the summary was not saved');
    await l2.ctx.close();
    log('release summary: drafted and published by a lead');

    // 6. A Viewer cannot edit
    const v = await open(viewer.email);
    await v.page.goto(`${BASE}/o/lumen/releases/${state.release.id}`);
    await v.page.locator('.ai-panel').waitFor({ state: 'detached' }).catch(() => {});
    check((await v.page.locator('.ai-panel').count()) === 0, 'a Viewer sees the release summary panel');
    await v.page.getByText('Recommendation', { exact: false }).first().waitFor();
    await v.page.goto(`${BASE}/o/lumen/bugs/${reported.key}`);
    await v.page.getByRole('heading', { name: reported.title }).first().waitFor();
    check((await v.page.getByRole('button', { name: /^Edit (title|description|labels)$/ }).count()) === 0, 'a Viewer can edit the bug');
    check((await v.page.locator('.dl select:not(:disabled)').count()) === 0, 'a Viewer can change bug fields');
    check((await v.page.getByRole('button', { name: 'Suggest triage' }).count()) === 0, 'a Viewer is offered AI triage');
    await v.page.goto(`${BASE}/o/lumen/board?project=${state.project.id}`);
    await v.page.locator('.board').waitFor();
    check((await v.page.locator('article.card[draggable="true"], button[aria-label^="Move"]').count()) === 0, 'a Viewer can move cards');
    await v.page.goto(`${BASE}/o/lumen/bugs/new`);
    await v.page.getByText('Viewers cannot report bugs').waitFor();
    await v.page.goto(`${BASE}/o/lumen/runs`);
    await v.page.getByRole('heading', { name: 'Test runs' }).waitFor();
    check((await v.page.getByRole('button', { name: 'New test run' }).count()) === 0, 'a Viewer sees New test run');
    const refused = await api(`${O()}/bugs/${reported.id}`, { method: 'PATCH', token: await login(viewer.email), body: { title: 'changed by a viewer' } });
    check(refused.status === 403, `the API let a Viewer edit a bug (${refused.status})`);
    await v.ctx.close();
    log('viewer: no edit, no move, no report, no run, no AI, the API answers 403');

    // 7. Workspace A cannot see workspace B
    const graceToken = await login('grace@harborclinics.test');
    const harbor = (await api('/orgs', { token: graceToken })).json.find((o) => o.org.slug !== 'lumen');
    check(harbor, 'the baseline seed has no second workspace for Grace');
    const H = `/orgs/${harbor.org.id}`;
    const ownHarbor = await api(`${H}/bugs?page_size=1`, { token: graceToken });
    check(ownHarbor.status === 200, 'Grace cannot read her own workspace');
    for (const [label, r] of [
      ['Lumen member on Harbor bugs', await api(`${H}/bugs`, { token: T })],
      ['Harbor member on Lumen bugs', await api(`${O()}/bugs`, { token: graceToken })],
      ['Harbor member on a Lumen bug', await api(`/orgs/${harbor.org.id}/bugs/${reported.id}`, { token: graceToken })],
      ['Harbor member on a Lumen bug in Lumen', await api(`${O()}/bugs/${reported.id}`, { token: graceToken })],
      ['Harbor member on a Lumen release', await api(`${O()}/releases/${state.release.id}`, { token: graceToken })],
    ]) check([403, 404].includes(r.status), `${label} answered ${r.status}`);
    const g = await open('grace@harborclinics.test');
    await g.page.goto(`${BASE}/o/lumen/bugs/${reported.key}`);
    await g.page.waitForLoadState('networkidle');
    await g.page.waitForTimeout(1000);
    check((await g.page.getByText(reported.title, { exact: false }).count()) === 0, 'a Harbor member sees a Lumen bug on screen');
    await g.ctx.close();
    log('tenants: neither workspace can read the other through the API or the screen');
    await q.ctx.close();
  } finally {
    await browser.close();
  }
}

main().then(() => { log('PASS'); }).catch((e) => { console.error(`journeys: FAIL ${e.message}`); process.exitCode = 1; }).finally(cleanup);
