// I-06 acceptance flow (SCR-12, SCR-13): a QA Engineer creates a suite and writes a case with 4 steps, reorders the steps (their ids
// stay), a Developer sees the case read only, and the case and the suite are deleted through their confirmations.
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/check-tests-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data is named flow-i06-<timestamp>. The script deletes its suites (their cases go with them) in a finally block, also those left
// by an earlier failed run (anything whose name starts with flow-i06-). Nothing else is touched.
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

const PREFIX = 'flow-i06-';
const TAG = `${PREFIX}${Date.now()}`;
const log = (message) => console.log(`flow-i06: ${message}`);
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
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
  return page;
}

// API as the Org Admin: setup, checks of what is stored, and cleanup. The behaviour under test goes through the screens.
async function admin() {
  const login = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'amara@lumenfreight.test', password: PW }) });
  if (!login.ok) throw new Error(`could not sign in the Org Admin: ${login.status}`);
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await login.json()).access_token}` };
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: h })).json();
  return { h, org: `${API}/api/v1/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}` };
}
async function cleanup() {
  const { h, org } = await admin();
  const suites = await (await fetch(`${org}/test-suites?page_size=100`, { headers: h })).json();
  const mine = suites.items.filter((s) => s.name.startsWith(PREFIX)); // only suites this script made; seeded suites are never touched
  for (const s of mine) await fetch(`${org}/test-suites/${s.id}`, { method: 'DELETE', headers: h });
  return mine.length;
}
const stepActions = (page) => page.locator('textarea[aria-label$="action"]').evaluateAll((els) => els.map((e) => e.value));

const browser = await chromium.launch();
let failed = false;
let step = 'start';
let lastPage = null;
try {
  step = 'remove leftovers of earlier runs';
  const stale = await cleanup();
  if (stale) log(`removed ${stale} suite(s) left by earlier runs`);
  const { h, org } = await admin();

  // 1. The QA Engineer creates a suite
  step = 'QA Engineer creates a suite';
  const qa = await signIn(browser, 'tomas@lumenfreight.test');
  lastPage = qa;
  const suiteName = `${TAG} suite`;
  await qa.goto(`${BASE}/o/lumen/tests`);
  await qa.waitForSelector('h1:has-text("Test suites")');
  await qa.waitForSelector('button:has-text("New suite")');
  await qa.click('button:has-text("New suite")');
  await qa.waitForSelector('.modal');
  await fillStable(qa, '#suite-name', suiteName);
  await qa.fill('#suite-description', 'Created by the I-06 flow script');
  await qa.click('.modal button:has-text("Create suite")');
  await qa.waitForSelector('.modal', { state: 'detached' });
  await qa.waitForSelector(`h2:has-text("${suiteName}")`);
  await qa.waitForSelector('text=No cases in this suite yet');
  log('the suite was created and is selected, with no cases yet');
  // Negative test hook only: fail on purpose here to see that the cleanup in finally removes the suite
  if (process.env.QA_FLOW_INJECT_FAILURE === '1') throw new Error('injected failure to test the cleanup');

  // 2. Write a case with 4 steps
  step = 'QA Engineer writes a case with 4 steps';
  await qa.click('a:has-text("New test case") >> nth=-1');
  await qa.waitForSelector('#c-title');
  const caseTitle = `${TAG} recalculate total after an address change`;
  await fillStable(qa, '#c-title', 'abcd');
  await qa.click('button:has-text("Save case")');
  await qa.waitForSelector('text=Title must be at least 5 characters.');
  log('a 4 character title is refused on the screen');
  await fillStable(qa, '#c-title', caseTitle);
  await qa.selectOption('#c-type', 'edge');
  await qa.selectOption('#c-pri', 'p1');
  await qa.fill('#c-pre', 'Discount SAVE10 is applied to the cart');
  await qa.fill('#c-tags', 'Discounts, address, discounts');
  for (let i = 1; i <= 4; i++) {
    if (i > 1) await qa.click('button:has-text("Add step")');
    await qa.fill(`textarea[aria-label="Step ${i} action"]`, `Action number ${i}`);
    await qa.fill(`textarea[aria-label="Step ${i} expected result"]`, `Expected number ${i}`);
  }
  await qa.click('button:has-text("Save case")');
  await qa.waitForURL(/\/o\/lumen\/tests\/cases\/TC-\d+$/);
  const key = new URL(qa.url()).pathname.split('/').pop();
  await qa.waitForSelector(`h1:has-text("${key}")`);
  const saved = await (await fetch(`${org}/test-cases/${key}`, { headers: h })).json();
  check(saved.steps.length === 4 && saved.case_type === 'edge' && saved.priority === 'p1', 'the saved case should have 4 steps, type Edge and priority P1');
  check(JSON.stringify(saved.tags) === JSON.stringify(['discounts', 'address']), `tags should be stored trimmed, lower case and without repeats, saw ${JSON.stringify(saved.tags)}`);
  log(`the case was saved as ${key} with 4 steps and the tags discounts and address`);

  // 3. Reorder the steps: the ids stay
  step = 'QA Engineer reorders the steps';
  const before = saved.steps.map((s) => s.id);
  await qa.click('button[aria-label="Move step 4 up"]');
  await qa.click('button[aria-label="Move step 2 up"]');
  const expectedOrder = ['Action number 2', 'Action number 1', 'Action number 4', 'Action number 3'];
  check(JSON.stringify(await stepActions(qa)) === JSON.stringify(expectedOrder), 'the steps should show in the new order before saving');
  await qa.click('button:has-text("Save case")');
  await qa.waitForSelector('text=/Case TC-\\d+ saved/');
  await qa.reload();
  await qa.waitForSelector('textarea[aria-label="Step 4 action"]');
  check(JSON.stringify(await stepActions(qa)) === JSON.stringify(expectedOrder), 'the new order should survive a reload');
  const after = await (await fetch(`${org}/test-cases/${key}`, { headers: h })).json();
  check(JSON.stringify(after.steps.map((s) => s.id)) === JSON.stringify([before[1], before[0], before[3], before[2]]),
    'reordering must keep each step id and move it with its step');
  log('the steps were reordered, saved, and kept their ids');

  // 4. The Developer sees the case read only
  step = 'Developer opens the case';
  const dev = await signIn(browser, 'diego@lumenfreight.test');
  lastPage = dev;
  await dev.goto(`${BASE}/o/lumen/tests/cases/${key}`);
  await dev.waitForSelector('textarea[aria-label="Step 1 action"]');
  check(await dev.isDisabled('#c-title') && await dev.isDisabled('textarea[aria-label="Step 1 action"]') && await dev.isDisabled('#c-tags'),
    'the Developer should see disabled fields');
  check((await dev.locator('button:has-text("Save case"), button:has-text("Add step"), button[aria-label^="Delete case"], button[aria-label^="Move step"]').count()) === 0,
    'the Developer should have no Save, Add step, Move or Delete');
  await dev.waitForSelector('text=Only QA roles can edit test cases.');
  await dev.goto(`${BASE}/o/lumen/tests`);
  await dev.waitForSelector('.suite-list a');
  check((await dev.locator('button:has-text("New suite"), a:has-text("New test case")').count()) === 0, 'the Developer should not see New suite or New test case');
  log('the Developer sees the case with disabled fields and no edit controls, and the suites screen without New suite');

  // 5. Edit the suite, delete the case, delete the suite with its count
  step = 'QA Engineer edits the suite';
  lastPage = qa;
  await qa.goto(`${BASE}/o/lumen/tests`);
  await qa.waitForSelector('.suite-list a');
  await qa.click(`.suite-list a:has-text("${suiteName}")`);
  await qa.waitForSelector(`h2:has-text("${suiteName}")`);
  await qa.waitForSelector(`text=${key}`);
  await qa.click('button:has-text("Edit suite")');
  await qa.waitForSelector('.modal');
  const renamed = `${TAG} renamed suite`;
  await fillStable(qa, '#suite-name', renamed);
  await qa.click('.modal button:has-text("Save suite")');
  await qa.waitForSelector('.modal', { state: 'detached' });
  await qa.waitForSelector(`h2:has-text("${renamed}")`);
  log('the suite was renamed through its dialog');

  step = 'QA Engineer deletes the case through the confirmation';
  await qa.click(`table.t a:has-text("${caseTitle}")`);
  await qa.waitForSelector('#c-title');
  await qa.click('button[aria-label^="Delete case"]');
  await qa.waitForSelector('.modal');
  await qa.click('.modal button:has-text("Delete case")');
  await qa.waitForURL(/\/o\/lumen\/tests\?suite=/);
  await qa.waitForSelector('text=No cases in this suite yet');
  const gone = await fetch(`${org}/test-cases/${key}`, { headers: h });
  check(gone.status === 404, 'the deleted case should be gone');
  log('the case was deleted through its confirmation');

  step = 'QA Engineer deletes the suite through the confirmation, which names the case count';
  const suites = await (await fetch(`${org}/test-suites?page_size=100`, { headers: h })).json();
  const suite = suites.items.find((s) => s.name === renamed);
  const extra = await fetch(`${org}/test-suites/${suite.id}/cases`, { method: 'POST', headers: h, body: JSON.stringify({
    title: `${TAG} second case`, steps: [{ action: 'Do it', expected: 'It works' }] }) });
  check(extra.ok, 'could not add the second case through the API');
  const extraKey = (await extra.json()).key;
  await qa.reload();
  await qa.waitForSelector(`h2:has-text("${renamed}")`);
  await qa.waitForSelector(`text=${extraKey}`);
  await qa.click('button[aria-label^="Delete suite"]');
  await qa.waitForSelector('#delete-suite-count');
  const copy = await qa.innerText('#delete-suite-count');
  check(copy.includes('Its 1 case is deleted with it'), `the confirmation should name the case count, it said: ${copy}`);
  await qa.click('.modal button:has-text("Delete suite")');
  await qa.waitForSelector('.modal', { state: 'detached' });
  await qa.waitForSelector(`.suite-list a:has-text("${renamed}")`, { state: 'detached' });
  check((await fetch(`${org}/test-cases/${extraKey}`, { headers: h })).status === 404, 'the case of the deleted suite should be gone');
  log(`the suite was deleted and the confirmation said: "${copy}"`);
} catch (e) {
  failed = true;
  console.log(`FAIL at step "${step}": ${String(e.message || e).split(/\r?\n/)[0]}`);
  if (lastPage) console.log(`  the page stood at ${new URL(lastPage.url()).pathname}${new URL(lastPage.url()).search}`);
} finally {
  // always runs, also when a step failed: every suite this script made goes (its cases go with it)
  await cleanup().then((n) => log(`cleanup: deleted ${n} test suite(s) still there`)).catch((e) => console.log(`note: cleanup failed: ${e.message}`));
  await browser.close();
}
if (failed) process.exit(1);
console.log('PASS: suite, case with 4 steps, reorder keeps ids, Developer read only, case and suite delete confirmations');
