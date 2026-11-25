// I-13 acceptance flow: Projects (SCR-06) and Project overview (SCR-07): the list with each project's figures, New project with its
// validation and the taken key, the overview (figures, bugs, runs, components, environments), managing components and environments,
// Edit project, Archive, the read only views and the not found states.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-projects-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: a project made through the API (key V + 4 letters, "flow-i13-<timestamp> data") with two bugs, a suite of three cases, a run
// and a release, and a second project made through the screen (key W + 4 letters). Cleanup in `finally`: bugs, release and suite are
// deleted and both projects archived. The run stays (BL-027).
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
const DATA_NAME = `flow-i13-${RUN} data`;
const DATA_KEY = `V${letters}`;
const NEW_NAME = `flow-i13-${RUN} new`;
const NEW_KEY = `W${letters}`;
const log = (m) => console.log(`flow-i13: ${m}`);
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
  await page.waitForURL('**/o/*/dashboard');
}

const state = { orgId: '', projects: [], suite: null, bugs: [], release: null, leadToken: '' };
const O = () => `/orgs/${state.orgId}`;

async function cleanup() {
  const notes = [];
  for (const b of state.bugs) notes.push(`bug ${b.key} deleted (${(await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.release) notes.push(`release deleted (${(await api(`${O()}/releases/${state.release.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.suite) notes.push(`suite deleted (${(await api(`${O()}/test-suites/${state.suite.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  const all = (await api(`${O()}/projects?page_size=100&include_archived=true`, { token: state.leadToken })).json?.items ?? [];
  for (const p of all.filter((x) => [DATA_KEY, NEW_KEY].includes(x.key))) {
    notes.push(`project ${p.key} archived (${(await api(`${O()}/projects/${p.id}`, { method: 'PATCH', token: state.leadToken, body: { archived: true } })).status})`);
  }
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

  const data = (await api(`${O()}/projects`, { method: 'POST', token: T, body: { name: DATA_NAME, key: DATA_KEY, description: 'The fixture project of the projects flow' } })).json;
  check(data?.id, 'could not create the data project');
  state.projects.push(data);
  const mk = async (title, severity) => {
    const r = await api(`${O()}/bugs`, { method: 'POST', token: T, body: { project_id: data.id, title, severity } });
    check(r.status === 201, `could not create ${title}: ${r.status}`);
    state.bugs.push(r.json);
  };
  await mk(`flow-i13 critical bug ${RUN}`, 'critical');
  await mk(`flow-i13 low bug ${RUN}`, 'low');
  state.suite = (await api(`${O()}/test-suites`, { method: 'POST', token: T, body: { project_id: data.id, name: 'flow-i13 suite' } })).json;
  for (const n of [1, 2, 3]) {
    await api(`${O()}/test-suites/${state.suite.id}/cases`, { method: 'POST', token: T, body: { title: `flow-i13 case ${n}`, steps: [{ action: 'Do it', expected: 'It works' }] } });
  }
  const run = (await api(`${O()}/test-runs`, { method: 'POST', token: T, body: { project_id: data.id, name: `flow-i13 run ${RUN}`, suite_ids: [state.suite.id] } })).json;
  for (const [i, result] of ['pass', 'pass', 'fail'].entries()) {
    await api(`${O()}/test-runs/${run.id}/results/${run.results[i].id}`, { method: 'PATCH', token: T, body: { result, ...(result === 'fail' ? { failed_step_index: 0 } : {}) } });
  }
  state.release = (await api(`${O()}/releases`, { method: 'POST', token: T, body: { project_id: data.id, name: `flow-i13 ${RUN} 1.0.0` } })).json;
  log(`project ${DATA_KEY} with 2 bugs (1 Critical), a suite of 3 cases, a run at 67% and a release`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await signIn(page, lead.email);
    const toast = (text) => page.locator('#toasts').getByText(text, { exact: false }).first();

    // 1. The list and its figures
    await page.goto(`${BASE}/o/lumen/projects`);
    await page.getByRole('heading', { name: 'Projects' }).waitFor();
    const row = page.locator('tr', { hasText: DATA_NAME });
    await row.waitFor();
    const cells = (await row.locator('td').allInnerTexts()).map((t) => t.trim().replace(/\s+/g, ' '));
    check(cells[1] === DATA_KEY, `the key cell is ${cells[1]}`);
    check(cells[2] === '2' && cells[3] === '1', `open bugs ${cells[2]} and Critical ${cells[3]} are not 2 and 1`);
    check(cells[4] === '67% pass', `the last run is ${cells[4]}`);
    check(cells[5].includes(`flow-i13 ${RUN} 1.0.0`) && cells[5].includes('At risk'), `the next release is ${cells[5]}`);
    log('list: the fixture project shows 2 open bugs, 1 Critical, a run at 67% and its release as At risk');

    // 2. New project: validation, the taken key, then created
    await page.getByRole('button', { name: 'New project' }).first().click();
    await page.waitForSelector('.modal');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.getByText('Name must be at least 2 characters.').waitFor();
    await page.getByText('Use 2 to 6 letters, for example WEB.').waitFor();
    const fillKey = async (value) => { await page.fill('#np-k', value); await page.waitForTimeout(150); }; // the field capitalizes what is typed
    await fillStable(page, '#np-n', NEW_NAME);
    await fillKey('1x');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.getByText('Use 2 to 6 letters, for example WEB.').waitFor();
    await fillKey('WEB');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.getByText('already used', { exact: false }).waitFor();
    await fillKey(NEW_KEY.toLowerCase());
    check((await page.inputValue('#np-k')) === NEW_KEY, 'the key is not shown in capitals');
    await page.fill('#np-d', 'Made by the flow');
    await page.getByRole('button', { name: 'Create project' }).click();
    await toast(`${NEW_NAME} created`).waitFor(); // before the page loads: a cold dev server can take longer than the toast stays
    await page.waitForURL(new RegExp(`/o/lumen/projects/${NEW_KEY}$`));
    await page.locator('h1', { hasText: NEW_NAME }).waitFor();
    log('new project: both fields are validated, the taken key WEB is refused, the key is stored in capitals, the overview opens');

    // 3. The overview of the new project: zeros, the default environments, the empty bug panel
    const num = async (cap) => (await page.locator('.readout > div', { hasText: cap }).locator('.num').innerText()).trim();
    check((await num('Open bugs')) === '0' && (await num('Open Critical')) === '0' && (await num('Pass rate')) === 'None' && (await num('Test suites')) === '0',
      'a new project is not all zeros');
    await page.getByText(`No bugs in ${NEW_NAME}`).waitFor();
    await page.getByText('No runs yet.').waitFor();
    const envs = (await page.locator('.panel', { hasText: 'Environments' }).locator('.label-chip').allInnerTexts()).map((t) => t.trim());
    check(envs.join(',') === 'dev,staging,prod', `environments: ${envs}`);
    log('overview: all zeros and None, the empty bug and run panels, dev, staging and prod');

    // 4. Components: add, a taken name, rename, delete
    await page.locator('.panel', { hasText: 'Components' }).getByRole('button', { name: 'Add' }).click();
    await page.waitForSelector('.modal');
    await page.getByRole('button', { name: 'Add component' }).click();
    await page.getByText('Enter a component name.').waitFor();
    await fillStable(page, '#mg-n', 'Checkout');
    await page.getByRole('button', { name: 'Add component' }).click();
    await toast('Checkout added').waitFor();
    await page.locator('.modal li', { hasText: 'Checkout' }).waitFor();
    await fillStable(page, '#mg-n', 'checkout');
    await page.getByRole('button', { name: 'Add component' }).click();
    await page.locator('.modal .err').waitFor();
    await page.getByRole('button', { name: 'Edit Checkout' }).click();
    await page.locator('.modal li input').first().fill('Checkout page');
    await page.getByRole('button', { name: 'Save component' }).click();
    await page.locator('.modal li', { hasText: 'Checkout page' }).waitFor();
    await page.getByRole('button', { name: 'Delete Checkout page' }).click();
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    check(await page.locator('.modal li', { hasText: 'Checkout page' }).count() === 1, 'Cancel deleted the component');
    await page.getByRole('button', { name: 'Delete Checkout page' }).click();
    await page.getByRole('button', { name: 'Delete component' }).click();
    await page.getByText('No components yet.').first().waitFor();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('.modal', { state: 'detached' });
    log('components: added, a name taken in other case is refused, renamed, Cancel keeps it, deleted');

    // 5. Environments: add, delete
    await page.locator('.panel', { hasText: 'Environments' }).getByRole('button', { name: 'Add' }).click();
    await page.waitForSelector('.modal');
    await fillStable(page, '#mg-n', 'canary');
    await page.getByRole('button', { name: 'Add environment' }).click();
    await page.locator('.modal li', { hasText: 'canary' }).waitFor();
    await page.getByRole('button', { name: 'Delete canary' }).click();
    await page.getByRole('button', { name: 'Delete environment' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.modal li').length === 3);
    await page.getByRole('button', { name: 'Done' }).click();
    const envsAfter = (await page.locator('.panel', { hasText: 'Environments' }).locator('.label-chip').allInnerTexts()).map((t) => t.trim());
    check(envsAfter.join(',') === 'dev,staging,prod', `environments after: ${envsAfter}`);
    log('environments: added and deleted, the default three remain');

    // 6. The overview of the data project, with its figures, bugs and run
    await page.goto(`${BASE}/o/lumen/projects/${DATA_KEY.toLowerCase()}`); // the address works in lower case too
    await page.locator('h1', { hasText: DATA_NAME }).waitFor();
    check((await num('Open bugs')) === '2' && (await num('Open Critical')) === '1', 'the data project figures are not 2 and 1');
    check((await num('Pass rate')) === '67%' && (await num('Test suites')) === '1', 'the data project pass rate or suites are wrong');
    await page.locator('.panel', { hasText: 'Recently updated bugs' }).locator('tr', { hasText: `flow-i13 critical bug ${RUN}` }).waitFor();
    await page.locator('.panel', { hasText: 'Latest test runs' }).locator('tr', { hasText: `flow-i13 run ${RUN}` }).waitFor();
    log('overview: the data project shows 2 open bugs, 1 Critical, 67%, 1 suite, its newest bugs and its run');

    // 7. Edit project: Cancel keeps, Save changes the description, the key is shown and cannot change
    await page.getByRole('button', { name: 'Edit project' }).click();
    await page.waitForSelector('.modal');
    check(await page.locator('#np-k').count() === 0 && (await page.locator('.modal').innerText()).includes(DATA_KEY), 'Edit shows the key as text');
    await page.fill('#np-n', 'x');
    await page.getByRole('button', { name: 'Save project' }).click();
    await page.getByText('Name must be at least 2 characters.').waitFor();
    await fillStable(page, '#np-n', DATA_NAME);
    await page.fill('#np-d', 'Changed by the flow');
    await page.getByRole('button', { name: 'Save project' }).click();
    await page.getByText('Changed by the flow').first().waitFor();
    log('edit project: the key is read only, a short name is refused, the description is saved');

    // 8. Archive the new project: Cancel keeps it, Archive removes it from the list
    await page.goto(`${BASE}/o/lumen/projects/${NEW_KEY}`);
    await page.locator('h1', { hasText: NEW_NAME }).waitFor();
    await page.getByRole('button', { name: 'Edit project' }).click();
    await page.getByRole('button', { name: 'Archive project' }).click();
    await page.getByRole('heading', { name: `Archive ${NEW_NAME}?` }).waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('heading', { name: 'Edit project' }).waitFor();
    await page.getByRole('button', { name: 'Archive project' }).click();
    await page.getByRole('button', { name: 'Archive project' }).last().click();
    await page.waitForURL(/\/o\/lumen\/projects$/);
    await page.getByRole('heading', { name: 'Projects' }).waitFor();
    await page.locator('tr', { hasText: DATA_NAME }).waitFor();
    check(await page.locator('tr', { hasText: NEW_NAME }).count() === 0, 'the archived project is still in the list');
    await page.goto(`${BASE}/o/lumen/projects/${NEW_KEY}`); // an archived project stays readable, without controls
    await page.getByText('This project is archived').waitFor();
    check(await page.getByRole('button', { name: 'Edit project' }).count() === 0, 'an archived project can still be edited');
    log('archive: Cancel keeps the project, Archive removes it from the list; the address still opens it read only');

    // 9. Not found
    await page.goto(`${BASE}/o/lumen/projects/ZZZZZ`);
    await page.getByText('This project was not found').waitFor();
    await page.goto(`${BASE}/o/lumen/projects/1`);
    await page.getByText('Page not found').waitFor();
    log('an unknown key shows "This project was not found", a bad key the 404 screen');

    // 10. Developer and Viewer read, without controls
    for (const [who, label] of [[dev, 'Developer'], [viewer, 'Viewer']]) {
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await c.newPage();
      p.setDefaultTimeout(30_000);
      await signIn(p, who.email);
      await p.goto(`${BASE}/o/lumen/projects`);
      await p.locator('tr', { hasText: DATA_NAME }).waitFor();
      check(await p.getByRole('button', { name: 'New project' }).count() === 0, `${label} sees New project`);
      await p.goto(`${BASE}/o/lumen/projects/${DATA_KEY}`);
      await p.locator('h1', { hasText: DATA_NAME }).waitFor();
      check(await p.getByRole('button', { name: 'Edit project' }).count() === 0 && await p.getByRole('button', { name: 'Add' }).count() === 0,
        `${label} sees Edit project or Add`);
      await c.close();
    }
    log('Developer and Viewer: the list and the overview without New project, Edit project or Add');
    const refused = await api(`${O()}/projects`, { method: 'POST', token: await login(viewer.email), body: { name: 'Nope', key: 'NOPE' } });
    check(refused.status === 403, `a Viewer created a project (${refused.status})`);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().then(() => { log('PASS'); }).catch((e) => { console.error(`flow-i13: FAIL ${e.message}`); process.exitCode = 1; }).finally(cleanup);
