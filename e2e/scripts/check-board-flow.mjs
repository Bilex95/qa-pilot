// I-04 acceptance flow: the Board (SCR-09), moves by drag and by the keyboard, the role rules, and the rollback when the server refuses.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-board-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: one project (key Z + 4 letters, name "flow-i04-<timestamp>") with three bugs titled "flow-i04-...". Everything is removed
// in `finally`, also after a failure: the bugs are soft deleted and the project is archived (bug keys are never reused, D-016).
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
const PROJECT_NAME = `flow-i04-${RUN}`;
const PROJECT_KEY = `Z${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const log = (m) => console.log(`flow-i04: ${m}`);
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
  await page.waitForURL('**/o/lumen/dashboard');
}

const state = { orgId: '', project: null, bugs: [], leadToken: '' };
const O = () => `/orgs/${state.orgId}`;
const statusOf = async (bug) => (await api(`${O()}/bugs/${bug.id}`, { token: state.leadToken })).json;

async function cleanup() {
  const notes = [];
  for (const b of state.bugs) {
    const r = await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken });
    notes.push(`bug ${b.key} deleted (${r.status})`);
  }
  if (state.project) {
    const r = await api(`${O()}/projects/${state.project.id}`, { method: 'PATCH', token: state.leadToken, body: { archived: true } });
    notes.push(`project archived (${r.status})`);
  }
  log(`cleanup: ${notes.join(', ')}`);
}

async function main() {
  const adminToken = await login('amara@lumenfreight.test'); // only to find the people by role
  const orgs = await api('/orgs', { token: adminToken });
  state.orgId = orgs.json.find((o) => o.org.slug === 'lumen').org.id;
  const members = (await api(`${O()}/members?page_size=100`, { token: adminToken })).json.items;
  const person = (role) => members.find((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test'))?.user;
  const lead = person('qa_lead'); const dev = person('developer'); const qa = person('qa_engineer'); const viewer = person('viewer');
  check(lead && dev && qa && viewer, 'the baseline seed has no QA Lead, Developer, QA Engineer or Viewer');
  state.leadToken = await login(lead.email);

  state.project = (await api(`${O()}/projects`, { method: 'POST', token: state.leadToken, body: { name: PROJECT_NAME, key: PROJECT_KEY } })).json;
  check(state.project?.id, 'could not create the project');
  const make = async (title, extra = {}) => {
    const r = await api(`${O()}/bugs`, { method: 'POST', token: state.leadToken, body: { project_id: state.project.id, title: `flow-i04 ${title}`, ...extra } });
    check(r.status === 201, `could not create ${title}: ${r.status}`);
    state.bugs.push(r.json);
    return r.json;
  };
  const bugA = await make('A for the developer', { assignee_id: dev.id, severity: 'high' });
  const bugB = await make('B for the QA engineer', { assignee_id: qa.id });
  const bugC = await make('C nobody has');
  log(`project ${PROJECT_KEY} with ${bugA.key}, ${bugB.key} and ${bugC.key}`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, lead.email);
    const toast = (text) => page.locator('#toasts').getByText(text, { exact: false }).first();
    const card = (b) => page.locator(`article.card[data-key="${b.key}"]`);
    const column = (status) => page.locator(`section.col[data-col="${status}"]`);
    await page.goto(`${BASE}/o/lumen/board?project=${state.project.id}`);
    await page.waitForSelector('section.col');
    check((await page.locator('section.col').count()) === 9, 'the board has nine columns');
    const names = await page.locator('section.col .col-head .badge').allInnerTexts();
    check(names.join('|') === 'New|Triaged|In progress|Fixed|Ready for retest|Verified|Closed|Reopened|Won\'t fix', `column order: ${names}`);
    check((await column('new').locator('article.card').count()) === 3, 'three cards in New');
    check((await column('new').locator('.col-head .n').innerText()) === '3', 'the New column counts 3');
    log('nine columns in workflow order, three cards in New with a count');

    // 1. Drag: QA Lead moves A from New to Triaged
    await card(bugA).dragTo(column('triaged'));
    await toast(`${bugA.key} moved to Triaged`).waitFor();
    check((await statusOf(bugA)).status === 'triaged', 'A is not Triaged on the server after the drag');
    check((await column('triaged').locator(`article.card[data-key="${bugA.key}"]`).count()) === 1, 'the card is not in the Triaged column');
    log('drag New to Triaged: moved, toast shown, server agrees');

    // 2. Drag to a column the table does not allow: the card stays and says why
    await card(bugA).dragTo(column('fixed')); // a column that is on screen next to it: a drag cannot scroll the board
    await toast('cannot move to Fixed').waitFor();
    check((await statusOf(bugA)).status === 'triaged', 'a refused drag changed the bug');
    check((await column('triaged').locator(`article.card[data-key="${bugA.key}"]`).count()) === 1, 'the card left its column on a refused drag');
    log('drag Triaged to Fixed: refused with the reason, the card stays');

    // 3. Keyboard: the Move to menu moves B from New to Triaged, and shows what is not allowed
    await card(bugB).locator('button[aria-label^="Move"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[role=menu]');
    const items = await page.locator('[role=menuitem]').allInnerTexts();
    check(items.length === 8 && !items.some((t) => t.startsWith('New')), `the menu lists the 8 other statuses, got ${items.length}`);
    check(items.find((t) => t.startsWith('Closed')) === 'Closed (not allowed)', 'Closed is not marked as not allowed from New');
    check(items.find((t) => t.startsWith('Triaged')) === 'Triaged', 'Triaged is not offered from New');
    const disabled = await page.locator('[role=menuitem][aria-disabled=true]').count();
    check(disabled === 6, `six of the eight statuses are not allowed from New for a QA Lead, found ${disabled}`);
    await page.getByRole('menuitem', { name: 'Triaged', exact: true }).click();
    await toast(`${bugB.key} moved to Triaged`).waitFor();
    check((await statusOf(bugB)).status === 'triaged', 'B is not Triaged after the keyboard move');
    log('Move to menu: eight statuses, the not allowed ones marked, Triaged works');

    // 4. The server refuses a move the screen thought was fine: the card returns with a message and the board is refreshed
    await page.reload();
    await page.waitForSelector('section.col');
    await api(`${O()}/bugs/${bugC.id}/transitions`, { method: 'POST', token: state.leadToken, body: { to_status: 'wont_fix' } }); // C is now Won't fix on the server
    await card(bugC).dragTo(column('triaged')); // the screen still shows C in New
    await toast('cannot move to Triaged any more').waitFor();
    await column('wont_fix').locator(`article.card[data-key="${bugC.key}"]`).waitFor(); // after the refresh C is where the server has it
    check((await statusOf(bugC)).status === 'wont_fix', 'C changed although the server refused');
    log('stale board: the server refused, the card was put back and the board refreshed');
    await api(`${O()}/bugs/${bugC.id}/transitions`, { method: 'POST', token: state.leadToken, body: { to_status: 'reopened' } });
    await api(`${O()}/bugs/${bugC.id}/transitions`, { method: 'POST', token: state.leadToken, body: { to_status: 'triaged' } });

    // 5. A server error rolls the card back (the request is answered 500)
    await page.reload();
    await page.waitForSelector('section.col');
    await page.route(/\/transitions$/, (route) => route.fulfill({ status: 500, contentType: 'application/json',
      headers: { 'access-control-allow-origin': BASE, 'access-control-allow-credentials': 'true' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong on our side.', details: {} } }) }));
    await card(bugC).dragTo(column('in_progress'));
    await toast('Could not move').waitFor();
    await column('triaged').locator(`article.card[data-key="${bugC.key}"]`).waitFor();
    await page.unroute(/\/transitions$/);
    check((await statusOf(bugC)).status === 'triaged', 'C moved although the request failed');
    log('server error: the optimistic move was rolled back with a message');
    await ctx.close();

    // 6. The Developer: own bug moves, someone else's does not, an unassigned one is taken
    const devCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d = await devCtx.newPage();
    await signIn(d, dev.email);
    await d.goto(`${BASE}/o/lumen/board?project=${state.project.id}`);
    await d.waitForSelector('section.col');
    const dToast = (text) => d.locator('#toasts').getByText(text, { exact: false }).first();
    const dCard = (b) => d.locator(`article.card[data-key="${b.key}"]`);
    const dCol = (status) => d.locator(`section.col[data-col="${status}"]`);
    await dCard(bugB).dragTo(dCol('in_progress'));
    await dToast('Only the assignee can move it').waitFor();
    check((await statusOf(bugB)).status === 'triaged', 'the Developer moved a bug assigned to someone else');
    check((await dCol('triaged').locator(`article.card[data-key="${bugB.key}"]`).count()) === 1, 'the refused card left its column');
    await dCard(bugA).dragTo(dCol('in_progress'));
    await dToast(`${bugA.key} moved to In progress`).waitFor();
    check((await statusOf(bugA)).status === 'in_progress', 'the Developer could not start their own bug');
    await dCard(bugC).dragTo(dCol('in_progress'));
    await dToast(`${bugC.key} moved to In progress`).waitFor();
    const taken = await statusOf(bugC);
    check(taken.status === 'in_progress' && taken.assignee_id === dev.id, 'starting an unassigned bug did not assign it to the Developer');
    await dCard(bugA).dragTo(dCol('new'));
    await dToast('cannot move to New').waitFor();
    check((await statusOf(bugA)).status === 'in_progress', 'a move that is not in the table changed the bug');
    log('Developer: own bug moves, a bug of someone else is refused with the assignee rule, an unassigned bug is taken');
    await devCtx.close();

    // 7. The Viewer sees the board but cannot move anything
    const viewCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const v = await viewCtx.newPage();
    await signIn(v, viewer.email);
    await v.goto(`${BASE}/o/lumen/board?project=${state.project.id}`);
    await v.waitForSelector('article.card');
    check((await v.locator('article.card[draggable="true"]').count()) === 0, 'a Viewer can drag cards');
    check((await v.locator('button[aria-label^="Move"]').count()) === 0, 'a Viewer sees the Move to button');
    log('Viewer: cards are not draggable and there is no Move to button');
    await viewCtx.close();
  } finally {
    await browser.close();
  }
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error(`flow-i04: FAIL ${e.message}`);
}
try { await cleanup(); } catch (e) { failed = true; console.error(`flow-i04: cleanup failed: ${e.message}`); }
if (failed) process.exitCode = 1;
else console.log('flow-i04: PASS');
