// I-06 parity capture: the real suites screen and case editor next to the locked screenshots (design/screenshots/test-suites-* and
// test-case-editor-*).
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/capture-tests-parity.mjs
// Writes e2e/parity/stage4/i06/app/*.png and e2e/parity/stage4/i06/compare/*.png (locked on the left, app on the right).
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. The suites and cases it needs are created through
// the API as the Lumen Org Admin (names start with parity-i06) and deleted at the end. The AI state of the case editor
// (test-case-editor-ai) belongs to I-17 and is not captured. The empty state is shown by answering the suite list with no suites.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i06');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const PREFIX = 'parity-i06 ';

async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', 'amara@lumenfreight.test');
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
  return { ctx, page };
}
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(APP, `${name}.png`) }); };

async function api() {
  const login = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'amara@lumenfreight.test', password: PW }) });
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await login.json()).access_token}` };
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: h })).json();
  return { h, org: `${API}/api/v1/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}` };
}
async function clearParity() {
  const { h, org } = await api();
  const suites = await (await fetch(`${org}/test-suites?page_size=100`, { headers: h })).json();
  for (const s of suites.items.filter((x) => x.name.startsWith(PREFIX))) await fetch(`${org}/test-suites/${s.id}`, { method: 'DELETE', headers: h });
}
async function createParity() {
  const { h, org } = await api();
  const projects = await (await fetch(`${org}/projects?page_size=100`, { headers: h })).json();
  const project = projects.items[0];
  const suite = async (name, description) => (await fetch(`${org}/test-suites`, { method: 'POST', headers: h,
    body: JSON.stringify({ project_id: project.id, name: `${PREFIX}${name}`, description }) })).json();
  const checkout = await suite('Checkout', 'Cart, discounts, payment and order confirmation.');
  await suite('Login and accounts', 'Sign in, password reset and profile.');
  const st = (action, expected) => ({ action, expected });
  const cases = [
    ['Apply a valid discount code', 'positive', 'p2', ['discounts'], [st('Open the cart', 'Cart shows one parcel and the subtotal'), st('Enter code SAVE10 and choose Apply', 'Code is accepted and listed under the subtotal'), st('Check the order total', 'Total is reduced by 10 percent'), st('Continue to payment', 'Payment page shows the reduced total')]],
    ['Reject an expired discount code', 'negative', 'p3', ['discounts'], [st('Enter code OLD5 and choose Apply', 'Message says the code has expired'), st('Check the order total', 'Total is unchanged')]],
    ['Recalculate total after changing delivery address', 'positive', 'p1', ['discounts', 'address'], [st('Open checkout', 'Delivery address and total are shown'), st('Change the delivery address to another city', 'Shipping cost updates'), st('Check the order total', 'Total includes the new shipping cost and still applies SAVE10'), st('Place the order', 'Confirmation shows the same total')]],
    ['Pay with a 3D Secure card', 'positive', 'p1', ['payments'], [st('Enter the card and choose Pay', '3D Secure challenge opens'), st('Approve the challenge', 'Order is confirmed')]],
    ['Checkout with 100 parcels in the cart', 'edge', 'p3', ['limits'], [st('Open the cart', 'All 100 parcels are listed with paging'), st('Continue to payment', 'Page loads in under 2 seconds')]],
  ];
  let third = '';
  for (const [title, case_type, priority, tags, steps] of cases) {
    const r = await (await fetch(`${org}/test-suites/${checkout.id}/cases`, { method: 'POST', headers: h,
      body: JSON.stringify({ title, case_type, priority, tags, steps, preconditions: 'Discount SAVE10 applied to the cart.' }) })).json();
    if (title.startsWith('Recalculate')) third = r.key;
  }
  return third;
}

const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
  'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
const suitesUrl = /\/api\/v1\/orgs\/[^/]+\/test-suites\?/;
const caseUrl = /\/api\/v1\/orgs\/[^/]+\/test-cases\//;
const answer500 = (route) => route.request().method() === 'OPTIONS'
  ? route.fulfill({ status: 204, headers: cors })
  : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
    body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) });

const browser = await chromium.launch();
const pairs = []; // [name, locked file]
try {
  await clearParity();
  const key = await createParity();

  const d = await open(browser, { width: 1440, height: 900 });
  await d.page.goto(`${BASE}/o/lumen/tests`);
  await d.page.waitForSelector('.suite-list a');
  await d.page.click(`.suite-list a:has-text("${PREFIX}Checkout")`);
  await d.page.waitForSelector('table.t tbody tr');
  await shot(d.page, 'test-suites-default-desktop'); pairs.push(['test-suites-default-desktop', 'test-suites-default-desktop.png']);
  await d.page.goto(`${BASE}/o/lumen/tests/cases/${key}`);
  await d.page.waitForSelector('textarea[aria-label="Step 4 action"]');
  await shot(d.page, 'test-case-editor-default-desktop'); pairs.push(['test-case-editor-default-desktop', 'test-case-editor-default-desktop.png']);

  const empty = await open(browser, { width: 1440, height: 900 });
  await empty.page.route(suitesUrl, async (route) => { const res = await route.fetch(); await route.fulfill({ response: res, json: { items: [], page: 1, page_size: 100, total: 0 } }); });
  await empty.page.goto(`${BASE}/o/lumen/tests`);
  await empty.page.waitForSelector('text=No test suites yet');
  await shot(empty.page, 'test-suites-empty-desktop'); pairs.push(['test-suites-empty-desktop', 'test-suites-empty-desktop.png']);
  await empty.ctx.close();

  const l = await open(browser, { width: 1440, height: 900 });
  await l.page.route(suitesUrl, () => { /* never answered: the screen stays in its loading state */ });
  await l.page.goto(`${BASE}/o/lumen/tests`);
  await l.page.waitForSelector('h1:has-text("Test suites")');
  await l.page.waitForSelector('[role=status]:has(.sk)');
  await shot(l.page, 'test-suites-loading-desktop'); pairs.push(['test-suites-loading-desktop', 'test-suites-loading-desktop.png']);
  await l.ctx.close();

  const e = await open(browser, { width: 1440, height: 900 });
  await e.page.route(suitesUrl, answer500);
  await e.page.goto(`${BASE}/o/lumen/tests`);
  await e.page.waitForSelector('text=Could not load test suites', { timeout: 30_000 });
  await shot(e.page, 'test-suites-error-desktop'); pairs.push(['test-suites-error-desktop', 'test-suites-error-desktop.png']);
  await e.ctx.close();

  const cl = await open(browser, { width: 1440, height: 900 });
  await cl.page.route(caseUrl, () => { /* never answered */ });
  await cl.page.goto(`${BASE}/o/lumen/tests/cases/${key}`);
  await cl.page.waitForSelector('h1:has-text("Test case")');
  await cl.page.waitForSelector('[role=status] .sk');
  await shot(cl.page, 'test-case-editor-loading-desktop'); pairs.push(['test-case-editor-loading-desktop', 'test-case-editor-loading-desktop.png']);
  await cl.ctx.close();

  const ce = await open(browser, { width: 1440, height: 900 });
  await ce.page.route(caseUrl, answer500);
  await ce.page.goto(`${BASE}/o/lumen/tests/cases/${key}`);
  await ce.page.waitForSelector('text=Could not load this test case', { timeout: 30_000 });
  await shot(ce.page, 'test-case-editor-error-desktop'); pairs.push(['test-case-editor-error-desktop', 'test-case-editor-error-desktop.png']);
  await ce.ctx.close();
  await d.ctx.close();

  const m = await open(browser, { width: 390, height: 844 });
  await m.page.goto(`${BASE}/o/lumen/tests`);
  await m.page.waitForSelector('.suite-list a');
  await m.page.click(`.suite-list a:has-text("${PREFIX}Checkout")`);
  await m.page.waitForSelector('table.t tbody tr');
  await shot(m.page, 'test-suites-default-mobile'); pairs.push(['test-suites-default-mobile', 'test-suites-default-mobile.png']);
  await m.page.goto(`${BASE}/o/lumen/tests/cases/${key}`);
  await m.page.waitForSelector('textarea[aria-label="Step 4 action"]');
  await shot(m.page, 'test-case-editor-default-mobile'); pairs.push(['test-case-editor-default-mobile', 'test-case-editor-default-mobile.png']);
  await m.ctx.close();

  const cmp = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  for (const [name, locked] of pairs) {
    const a = readFileSync(resolve(LOCKED, locked)).toString('base64');
    const b = readFileSync(resolve(APP, `${name}.png`)).toString('base64');
    await cmp.setContent(`<body style="margin:0;background:#ccc;font:14px sans-serif;display:flex;gap:12px;align-items:flex-start">
      <figure style="margin:0"><figcaption style="padding:6px">Locked prototype (${locked})</figcaption><img src="data:image/png;base64,${a}"></figure>
      <figure style="margin:0"><figcaption style="padding:6px">App (${name})</figcaption><img src="data:image/png;base64,${b}"></figure></body>`);
    await cmp.waitForLoadState('load');
    await cmp.screenshot({ path: resolve(CMP, `${name}.png`), fullPage: true });
  }
  console.log(`Captured ${pairs.length} states: ${pairs.map((p) => p[0]).join(', ')}`);
} catch (err) {
  console.log(`FAIL: ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await clearParity().catch((err) => console.log(`note: could not remove the parity suites: ${err.message}`));
  await browser.close();
}
