// I-10 parity capture: the real Members screen next to the locked screenshots (design/screenshots/members-*).
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/capture-members-parity.mjs
// Writes e2e/parity/stage4/i10/app/*.png and e2e/parity/stage4/i10/compare/*.png (locked on the left, app on the right).
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. The invite link shown in the invite state
// is masked before the screenshot and the invitation is revoked afterwards.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i10');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const INVITE_EMAIL = 'parity-i10@qapilot.test';

async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function signIn(page) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', 'amara@lumenfreight.test');
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
}
async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await signIn(page);
  return { ctx, page };
}
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(APP, `${name}.png`) }); };

const browser = await chromium.launch();
const pairs = []; // [name, locked file]
try {
  // Desktop 1440 x 900: default, invite (with link), loading, error
  const d = await open(browser, { width: 1440, height: 900 });
  await d.page.goto(`${BASE}/o/lumen/members`);
  await d.page.waitForSelector('table.t tbody tr');
  await d.page.waitForSelector('text=Pending invitations');
  await shot(d.page, 'members-default-desktop'); pairs.push(['members-default-desktop', 'members-default-desktop.png']);

  await d.page.click('button:has-text("Invite people")');
  await d.page.waitForSelector('.modal');
  await fillStable(d.page, '#inv-email', INVITE_EMAIL);
  await d.page.click('.modal button:has-text("Create invite link")');
  await d.page.waitForSelector('#inv-link');
  await d.page.addStyleTag({ content: '#inv-link { -webkit-text-security: disc; }' }); // never capture the secret link
  await shot(d.page, 'members-invite-desktop'); pairs.push(['members-invite-desktop', 'members-invite-desktop.png']);
  await d.page.click('.modal button:has-text("Done")');
  await d.page.waitForSelector('.modal', { state: 'detached' });
  await d.page.click(`button[aria-label="Revoke the invitation for ${INVITE_EMAIL}"]`);
  await d.page.waitForSelector(`text=${INVITE_EMAIL}`, { state: 'detached' });

  // Loading: hold the members request open while the screenshot is taken
  const l = await open(browser, { width: 1440, height: 900 });
  await l.page.route('**/api/v1/orgs/*/members?*', () => { /* never answered: the screen stays in its loading state */ });
  await l.page.goto(`${BASE}/o/lumen/members`);
  await l.page.waitForSelector('h1:has-text("Members and roles")'); // the shell is up, so the skeleton below is the members one
  await l.page.waitForSelector('[role=status]:has(.sk)');
  await shot(l.page, 'members-loading-desktop'); pairs.push(['members-loading-desktop', 'members-loading-desktop.png']);
  await l.ctx.close();

  // Error: the server answers 500 (the screen retries twice before it gives up)
  const e = await open(browser, { width: 1440, height: 900 });
  // A real 500 with the CORS headers the API sends, so the screen shows an HTTP error with its request id (not a network error)
  const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
  await e.page.route('**/api/v1/orgs/*/members?*', (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) }));
  await e.page.goto(`${BASE}/o/lumen/members`);
  await e.page.waitForSelector('text=Could not load members', { timeout: 30_000 });
  await shot(e.page, 'members-error-desktop'); pairs.push(['members-error-desktop', 'members-error-desktop.png']);
  await e.ctx.close();
  await d.ctx.close();

  // Mobile 390 x 844: default
  const m = await open(browser, { width: 390, height: 844 });
  await m.page.goto(`${BASE}/o/lumen/members`);
  await m.page.waitForSelector('table.t tbody tr');
  await m.page.waitForSelector('text=Pending invitations');
  await shot(m.page, 'members-default-mobile'); pairs.push(['members-default-mobile', 'members-default-mobile.png']);
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
  console.log(`Captured ${pairs.length} states: ${pairs.map((p) => p[0]).join(', ')}`);
} catch (err) {
  console.log(`FAIL: ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
