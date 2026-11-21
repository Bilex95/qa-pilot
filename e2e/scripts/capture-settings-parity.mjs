// I-11 parity capture: the real Settings screen next to the locked screenshots (design/screenshots/settings-*).
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/capture-settings-parity.mjs
// Writes e2e/parity/stage4/i11/app/*.png and e2e/parity/stage4/i11/compare/*.png (locked on the left, app on the right).
// The locked set has no Audit log screenshot, so that tab is captured for the review without a pair.
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. Nothing is changed in the workspace.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i11');
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

const browser = await chromium.launch();
const pairs = []; // [name, locked file]
try {
  const d = await open(browser, { width: 1440, height: 900 });
  await d.page.goto(`${BASE}/o/lumen/settings`);
  await d.page.waitForSelector('#s-name');
  await d.page.waitForSelector('#s-lim');
  await shot(d.page, 'settings-default-desktop'); pairs.push(['settings-default-desktop', 'settings-default-desktop.png']);

  await d.page.goto(`${BASE}/o/lumen/settings?tab=profile`);
  await d.page.waitForSelector('#p-name');
  await shot(d.page, 'settings-profile-desktop'); pairs.push(['settings-profile-desktop', 'settings-profile-desktop.png']);

  await d.page.goto(`${BASE}/o/lumen/settings?tab=audit`);
  await d.page.waitForSelector('table.t tbody tr');
  await shot(d.page, 'settings-audit-desktop');

  // Loading: hold the workspace request open while the screenshot is taken
  const l = await open(browser, { width: 1440, height: 900 });
  await l.page.route(/\/api\/v1\/orgs\/[^/]+$/, () => { /* never answered: the tab stays in its loading state */ });
  await l.page.goto(`${BASE}/o/lumen/settings`);
  await l.page.waitForSelector('h1:has-text("Settings")');
  await l.page.waitForSelector('[role=status]:has(.sk), .sk');
  await shot(l.page, 'settings-loading-desktop'); pairs.push(['settings-loading-desktop', 'settings-loading-desktop.png']);
  await l.ctx.close();

  // Error: a real 500 with the CORS headers the API sends, so the screen shows an HTTP error with its request id
  const e = await open(browser, { width: 1440, height: 900 });
  const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
  await e.page.route(/\/api\/v1\/orgs\/[^/]+$/, (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) }));
  await e.page.goto(`${BASE}/o/lumen/settings`);
  await e.page.waitForSelector('text=Could not load the workspace settings', { timeout: 30_000 });
  await shot(e.page, 'settings-error-desktop'); pairs.push(['settings-error-desktop', 'settings-error-desktop.png']);
  await e.ctx.close();
  await d.ctx.close();

  const m = await open(browser, { width: 390, height: 844 });
  await m.page.goto(`${BASE}/o/lumen/settings`);
  await m.page.waitForSelector('#s-name');
  await m.page.waitForSelector('#s-lim');
  await shot(m.page, 'settings-default-mobile'); pairs.push(['settings-default-mobile', 'settings-default-mobile.png']);
  await m.page.goto(`${BASE}/o/lumen/settings?tab=audit`);
  await m.page.waitForSelector('table.t tbody tr');
  await shot(m.page, 'settings-audit-mobile');
  await m.page.goto(`${BASE}/o/lumen/settings?tab=profile`);
  await m.page.waitForSelector('#p-name');
  await shot(m.page, 'settings-profile-mobile');
  await m.ctx.close();

  // Side by side: locked prototype on the left, the app on the right
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
  console.log(`Captured ${pairs.length} paired states: ${pairs.map((p) => p[0]).join(', ')}, plus the audit log and mobile tabs`);
} catch (err) {
  console.log(`FAIL: ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
