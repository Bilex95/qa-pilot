// I-03 parity capture: the real bug list and New bug form next to the locked screenshots (design/screenshots/bug-list-* and bug-new-*).
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/capture-bugs-parity.mjs
// Writes e2e/parity/stage4/i03/app/*.png and e2e/parity/stage4/i03/compare/*.png (locked on the left, app on the right).
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. The bugs it needs are created through the API as
// the Lumen Org Admin (titles start with parity-i03) and soft deleted at the end. The AI states (bug-new-ai, bug-new-loading)
// belong to I-15 and are not captured.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i03');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

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
async function clearParityBugs() {
  const { h, org } = await api();
  const bugs = await (await fetch(`${org}/bugs?q=parity-i03&page_size=100`, { headers: h })).json();
  for (const b of bugs.items) await fetch(`${org}/bugs/${b.id}`, { method: 'DELETE', headers: h });
}
async function createParityBugs() {
  const { h, org } = await api();
  const projects = await (await fetch(`${org}/projects?page_size=100`, { headers: h })).json();
  const project = projects.items[0];
  const members = await (await fetch(`${org}/members?page_size=100`, { headers: h })).json();
  const devs = members.items.filter((m) => m.role === 'developer').map((m) => m.user.id);
  const labels = await (await fetch(`${org}/labels`, { headers: h })).json();
  const rows = [
    ['Checkout total ignores discount code after changing delivery address', 'critical', 'p1'],
    ['Shipment tracking events arrive out of order for multi leg routes', 'high', 'p2'],
    ['Invoice PDF shows the wrong currency symbol for Swiss customers', 'medium', 'p3'],
    ['Tooltip on the route map is cut off at the right edge', 'low', 'p4'],
    ['Driver app crashes when the network drops during photo upload', 'high', 'p1'],
    ['Password reset email takes more than ten minutes to arrive', 'medium', 'p2'],
    ['Export to CSV drops the last row when the filter has one result', 'medium', 'p3'],
    ['Search ignores accents in customer names', 'low', 'p3'],
  ];
  for (const [i, [title, severity, priority]] of rows.entries()) {
    const r = await fetch(`${org}/bugs`, { method: 'POST', headers: h, body: JSON.stringify({
      project_id: project.id, title: `parity-i03 ${title}`, severity, priority, assignee_id: i % 3 === 2 ? undefined : devs[i % devs.length],
      label_ids: labels.length && i % 2 === 0 ? [labels[i % labels.length].id] : [] }) });
    if (!r.ok) throw new Error(`could not create a parity bug: ${r.status}`);
  }
}

const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
  'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
const bugsUrl = /\/api\/v1\/orgs\/[^/]+\/bugs\?/;

const browser = await chromium.launch();
const pairs = []; // [name, locked file]
try {
  await clearParityBugs();
  await createParityBugs();

  const d = await open(browser, { width: 1440, height: 900 });
  await d.page.goto(`${BASE}/o/lumen/bugs`);
  await d.page.waitForSelector('table.t tbody tr');
  await shot(d.page, 'bug-list-default-desktop'); pairs.push(['bug-list-default-desktop', 'bug-list-default-desktop.png']);

  // The locked "empty" screenshot is a search with no match ("refund")
  await fillStable(d.page, '#f-q', 'refund');
  await d.page.waitForSelector('text=No bugs match these filters');
  await shot(d.page, 'bug-list-empty-desktop'); pairs.push(['bug-list-empty-desktop', 'bug-list-empty-desktop.png']);

  await d.page.goto(`${BASE}/o/lumen/bugs/new`);
  await d.page.waitForSelector('#n-title');
  await shot(d.page, 'bug-new-default-desktop'); pairs.push(['bug-new-default-desktop', 'bug-new-default-desktop.png']);
  await d.page.click('button:has-text("Save bug")');
  await d.page.waitForSelector('.banner.error');
  await shot(d.page, 'bug-new-error-desktop'); pairs.push(['bug-new-error-desktop', 'bug-new-error-desktop.png']);

  const l = await open(browser, { width: 1440, height: 900 });
  await l.page.route(bugsUrl, () => { /* never answered: the screen stays in its loading state */ });
  await l.page.goto(`${BASE}/o/lumen/bugs`);
  await l.page.waitForSelector('h1:has-text("Bugs")');
  await l.page.waitForSelector('[role=status]:has(.sk)');
  await shot(l.page, 'bug-list-loading-desktop'); pairs.push(['bug-list-loading-desktop', 'bug-list-loading-desktop.png']);
  await l.ctx.close();

  const e = await open(browser, { width: 1440, height: 900 });
  await e.page.route(bugsUrl, (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) }));
  await e.page.goto(`${BASE}/o/lumen/bugs`);
  await e.page.waitForSelector('text=Could not load bugs', { timeout: 30_000 });
  await shot(e.page, 'bug-list-error-desktop'); pairs.push(['bug-list-error-desktop', 'bug-list-error-desktop.png']);
  await e.ctx.close();
  await d.ctx.close();

  const m = await open(browser, { width: 390, height: 844 });
  await m.page.goto(`${BASE}/o/lumen/bugs`);
  await m.page.waitForSelector('table.t tbody tr');
  await shot(m.page, 'bug-list-default-mobile'); pairs.push(['bug-list-default-mobile', 'bug-list-default-mobile.png']);
  await m.page.goto(`${BASE}/o/lumen/bugs/new`);
  await m.page.waitForSelector('#n-title');
  await shot(m.page, 'bug-new-default-mobile'); pairs.push(['bug-new-default-mobile', 'bug-new-default-mobile.png']);
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
  await clearParityBugs().catch((err) => console.log(`note: could not remove the parity bugs: ${err.message}`));
  await browser.close();
}
