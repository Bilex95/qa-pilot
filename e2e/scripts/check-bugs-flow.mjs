// I-03 acceptance flow (SCR-08, SCR-11): a QA Engineer and a Developer report bugs through the form, the list filters and finds
// them, a saved view is created, applied and deleted, and the label delete confirmation names the bug count.
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/check-bugs-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data is named flow-i03-<timestamp>. The script soft deletes its bugs and deletes its view and label at the end, also
// those left by an earlier failed run (anything whose title or name starts with flow-i03-).
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

const TAG = `flow-i03-${Date.now()}`;
const log = (message) => console.log(`flow-i03: ${message}`);
const check = (condition, message) => { if (!condition) throw new Error(message); };

async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function signIn(browser, email) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(60_000);
  await page.addInitScript(() => {
    window.__bugBodies = [];
    const original = window.fetch;
    window.fetch = async (input, init) => {
      try {
        if (input instanceof Request && input.method === 'POST' && /\/orgs\/[^/]+\/bugs$/.test(input.url)) {
          window.__bugBodies.push(await input.clone().text());
        }
      } catch { /* recording must never break the app */ }
      return original(input, init);
    };
  });
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
  return page;
}

// API helpers as the Org Admin: setup and cleanup only; the behaviour under test goes through the screens
async function admin() {
  const login = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'amara@lumenfreight.test', password: PW }) });
  if (!login.ok) throw new Error(`could not sign in the Org Admin: ${login.status}`);
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await login.json()).access_token}` };
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: h })).json();
  return { h, org: `${API}/api/v1/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}` };
}
// Saved views are private, so each person's own test views are removed with that person's own token. Only views whose name
// starts with flow-i03- are touched (the prefix this script gives its views); seeded views are never deleted.
const TEST_PREFIX = 'flow-i03-';
const FLOW_USERS = ['amara@lumenfreight.test', 'tomas@lumenfreight.test', 'diego@lumenfreight.test'];
async function deleteTestViews(email) {
  const login = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }) });
  if (!login.ok) throw new Error(`could not sign in ${email} to remove test views: ${login.status}`);
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await login.json()).access_token}` };
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: h })).json();
  const org = `${API}/api/v1/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  let removed = 0;
  for (const v of await (await fetch(`${org}/saved-views`, { headers: h })).json()) {
    if (v.name.startsWith(TEST_PREFIX)) { await fetch(`${org}/saved-views/${v.id}`, { method: 'DELETE', headers: h }); removed++; }
  }
  return removed;
}
async function cleanup() {
  const { h, org } = await admin();
  const bugs = await (await fetch(`${org}/bugs?q=${TEST_PREFIX}&page_size=100`, { headers: h })).json();
  for (const b of bugs.items) await fetch(`${org}/bugs/${b.id}`, { method: 'DELETE', headers: h });
  for (const l of await (await fetch(`${org}/labels`, { headers: h })).json()) {
    if (l.name.startsWith(TEST_PREFIX)) await fetch(`${org}/labels/${l.id}`, { method: 'DELETE', headers: h });
  }
  let views = 0;
  for (const email of FLOW_USERS) views += await deleteTestViews(email);
  return { bugs: bugs.items.length, views };
}

async function fileBug(page, { title, severity, priority, label }) {
  await page.goto(`${BASE}/o/lumen/bugs/new`);
  await page.waitForSelector('#n-title');
  await page.waitForFunction(() => document.querySelectorAll('#n-proj option').length > 0);
  await fillStable(page, '#n-title', title);
  await page.fill('#n-step-1', 'Open the checkout page');
  await page.fill('#n-exp', 'The total includes the discount');
  await page.fill('#n-act', 'The discount is missing');
  if (severity) await page.selectOption('#n-sev', severity);
  if (priority) await page.selectOption('#n-pri', priority);
  if (label) await page.click(`#n-lab button:has-text("${label}")`);
  await page.evaluate(() => { window.__bugBodies = []; });
  await page.click('button:has-text("Save bug")');
  // The body is recorded by the fetch wrapper installed in signIn: the app sends a Request object, whose body Playwright cannot read
  await page.waitForFunction(() => window.__bugBodies.length > 0);
  const raw = (await page.evaluate(() => window.__bugBodies))[0];
  const body = JSON.parse(raw);
  check(body.project_id && body.title, 'the create request body should have project_id and title (is the body being read?)');
  await page.waitForURL('**/o/lumen/bugs');
  await page.waitForSelector('text=/Bug [A-Z]+-\\d+ reported/');
  return body;
}
async function findRow(page, text) {
  await page.waitForSelector('#f-q');
  await fillStable(page, '#f-q', text);
  const row = page.locator('table.t tbody tr', { hasText: text });
  await row.first().waitFor();
  return row.first();
}

const browser = await chromium.launch();
let failed = false;
let step = 'start';
let lastPage = null; // the page being driven, to say where it stood when a step failed
try {
  step = 'remove leftovers of earlier runs';
  const stale = await cleanup();
  if (stale.bugs || stale.views) log(`removed ${stale.bugs} bug(s) and ${stale.views} view(s) left by earlier runs`);

  const { h, org } = await admin();
  const labelName = `${TAG}-label`;
  await fetch(`${org}/labels`, { method: 'POST', headers: h, body: JSON.stringify({ name: labelName }) });

  // 1. The QA Engineer reports a bug with severity and priority and a label
  step = 'QA Engineer reports a bug';
  const qa = await signIn(browser, 'tomas@lumenfreight.test');
  lastPage = qa;
  const qaTitle = `${TAG} checkout total is wrong`;
  const qaBody = await fileBug(qa, { title: qaTitle, severity: 'high', priority: 'p2', label: labelName });
  check(qaBody.severity === 'high' && qaBody.priority === 'p2', `the QA Engineer request should carry the chosen severity and priority; it had severity=${qaBody.severity} priority=${qaBody.priority}`);
  check(!('release_id' in qaBody) && !('source_run_result_id' in qaBody), 'release_id and source_run_result_id must not be sent');
  log('the QA Engineer reported a bug with severity High and priority P2');

  step = 'QA Engineer finds the bug in the list';
  let row = await findRow(qa, TAG);
  const key = (await row.locator('td.no-label .mono').innerText()).trim();
  check(/^[A-Z]{2,6}-\d+$/.test(key), `the list shows a key like WEB-1, saw "${key}"`);
  check((await row.innerText()).includes('High') && (await row.innerText()).includes('P2'), 'the row should show High and P2');
  log(`the bug is in the list as ${key}`);

  // 2. The Developer reports a bug: severity and priority are left out of the request, the server forces Medium and P3
  step = 'Developer reports a bug';
  const dev = await signIn(browser, 'diego@lumenfreight.test');
  const devTitle = `${TAG} tooltip is cut off`;
  const devBody = await fileBug(dev, { title: devTitle });
  for (const field of ['severity', 'priority', 'release_id', 'source_run_result_id']) {
    check(!(field in devBody), `the Developer request must not contain ${field}`);
  }
  row = await findRow(dev, devTitle);
  const devText = await row.innerText();
  check(devText.includes('Medium') && devText.includes('P3'), 'the Developer bug should be Medium and P3');
  log('the Developer request has no severity, priority, release_id or source_run_result_id; the bug is Medium and P3');

  // 3. Filters: unassigned, status, search that matches nothing, More filters
  step = 'QA Engineer filters the list';
  // each change is made only after the previous one has reached the URL, as a person would (the filters live in the URL)
  await fillStable(qa, '#f-q', TAG);
  await qa.waitForURL((u) => u.searchParams.get('q') === TAG);
  await qa.selectOption('#f-a', 'none');
  await qa.waitForURL((u) => u.searchParams.get('assignee') === 'none');
  await qa.waitForFunction(() => document.querySelectorAll('table.t tbody tr').length > 0);
  await qa.waitForTimeout(600);
  const cells = await qa.locator('table.t tbody td[data-label="Assignee"]').allInnerTexts();
  check(cells.length >= 2 && cells.every((c) => c.trim() === 'Unassigned'), 'the Unassigned filter should list only unassigned bugs');
  log(`the Unassigned filter lists ${cells.length} unassigned bugs`);
  await qa.selectOption('#f-a', '');
  await qa.waitForURL((u) => !u.searchParams.has('assignee'));
  await qa.selectOption('#f-s', 'closed');
  await qa.waitForURL((u) => u.searchParams.get('status') === 'closed');
  await qa.waitForSelector('text=No bugs match these filters');
  await qa.selectOption('#f-s', 'open');
  await qa.waitForURL((u) => !u.searchParams.has('status'));
  await qa.click('button:has-text("More filters")');
  await qa.selectOption('#f-pri', 'p2');
  await qa.waitForURL((u) => u.searchParams.get('priority') === 'p2');
  // the previous rows stay on screen while the new page loads, so wait for the narrowed list itself
  await qa.waitForFunction((t) => {
    const rows = [...document.querySelectorAll('table.t tbody tr')];
    return rows.length === 1 && rows[0].textContent.includes(t);
  }, TAG).catch(() => {});
  const narrowed = await qa.locator('table.t tbody tr').count();
  check(narrowed === 1, `Status Open and priority P2 with the search should leave the one bug, found ${narrowed} at ${new URL(qa.url()).search}`);
  log('status and More filters (priority) narrow the list');
  await qa.selectOption('#f-pri', '');
  await qa.waitForURL((u) => !u.searchParams.has('priority'));

  // 4. Saved view: create from the filters, clear, apply, reload, delete through the confirmation
  step = 'QA Engineer saves, applies and deletes a view';
  const viewName = `${TAG}-view`;
  qa.on('response', async (r) => {
    if (r.request().method() === 'POST' && r.url().endsWith('/saved-views')) log(`saved view stored with filters ${JSON.stringify((await r.json()).filters)}`);
  });
  await qa.click('.views button:has-text("Save view")');
  await fillStable(qa, '#view-name', viewName);
  await qa.click('.modal button:has-text("Save view")');
  await qa.waitForSelector('.modal', { state: 'detached' });
  await qa.waitForSelector(`.views button[aria-label="Delete view ${viewName}"]`);
  await qa.click('button:has-text("Clear filters")');
  await qa.waitForFunction(() => document.querySelector('#f-q').value === '');
  await qa.waitForURL((u) => !u.searchParams.has('q')); // as a person would: the list has changed before the next click
  await qa.click(`.views button[title="${viewName}"]`);
  await qa.waitForFunction((t) => document.querySelector('#f-q').value === t, TAG);
  check((await qa.getAttribute(`.views button[title="${viewName}"]`, 'aria-pressed')) === 'true', 'the applied view should be pressed');
  await qa.reload();
  await qa.waitForSelector(`.views button[title="${viewName}"][aria-pressed="true"]`);
  log('the saved view was created, applied, and is still applied after a reload (the filters live in the URL)');
  await dev.goto(`${BASE}/o/lumen/bugs`);
  await dev.waitForSelector('.views');
  check((await dev.locator(`.views button[title="${viewName}"]`).count()) === 0, 'another person must not see the view');
  log('the view is private: the Developer does not see it');
  await qa.click(`.views button[aria-label="Delete view ${viewName}"]`);
  await qa.waitForSelector('.modal');
  await qa.click('.modal button:has-text("Delete view")');
  await qa.waitForSelector(`.views button[title="${viewName}"]`, { state: 'detached' });
  log('the view was deleted through the confirmation');

  // 5. A key link opens the bug detail placeholder (I-05 builds the real screen)
  step = 'open the bug key link';
  await fillStable(qa, '#f-q', qaTitle);
  await (await findRow(qa, qaTitle)).locator('a').first().click();
  await qa.waitForSelector(`h1:has-text("Bug ${key}")`);
  await qa.waitForSelector('text=is on its way');
  log('the key link opens the placeholder for the bug detail (I-05)');

  // 6. The label delete confirmation says how many bugs lose the label
  step = 'delete the label through the confirmation';
  const lead = await signIn(browser, 'amara@lumenfreight.test');
  await lead.goto(`${BASE}/o/lumen/settings`);
  await lead.waitForSelector(`button[aria-label="Delete label ${labelName}"]`);
  await lead.click(`button[aria-label="Delete label ${labelName}"]`);
  await lead.waitForSelector('#delete-label-count');
  const copy = await lead.innerText('#delete-label-count');
  check(copy.includes('removed from 1 bug'), `the confirmation should say the label is removed from 1 bug, it said: ${copy}`);
  await lead.click('.modal button:has-text("Delete label")');
  await lead.waitForSelector('.modal', { state: 'detached' });
  log(`the confirmation said: "${copy}"`);
  const after = await (await fetch(`${org}/bugs?q=${encodeURIComponent(qaTitle)}`, { headers: h })).json();
  check(after.items.length === 1 && after.items[0].labels.length === 0, 'the bug should stay and lose the label');
  log('the bug stays and no longer has the label');
} catch (e) {
  failed = true;
  console.log(`FAIL at step "${step}": ${String(e.message || e).split(/\r?\n/)[0]}`);
  if (lastPage) {
    const box = await lastPage.inputValue('#f-q').catch(() => '(no search box)');
    const tabs = await lastPage.locator('.views button').allInnerTexts().catch(() => []);
    console.log(`  the page stood at ${new URL(lastPage.url()).pathname}${new URL(lastPage.url()).search}, search box "${box}", tabs: ${tabs.join(' | ').slice(0, 200)}`);
  }
} finally {
  // always runs, also when a step failed: bugs, the test label and every flow user's test views
  await cleanup().then((n) => log(`cleanup: soft deleted ${n.bugs} test bug(s), removed the test label and ${n.views} test view(s) still there`)).catch((e) => console.log(`note: cleanup failed: ${e.message}`));
  await browser.close();
}
if (failed) process.exit(1);
console.log('PASS: report as QA Engineer and as Developer, find, filter, saved view, key link, label delete confirmation');
