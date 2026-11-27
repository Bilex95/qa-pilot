// Stage 3 gate check: sign in through the real UI against the running Docker stack.
// Usage (from e2e/): node scripts/smoke-login.mjs [baseUrl]
// Reads SEED_USER_PASSWORD from ../.env (never printed). Needs: compose up, seed --scenario baseline.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.argv[2] || 'http://localhost:3000';
const env = Object.fromEntries(readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const PW = env.SEED_USER_PASSWORD;
if (!PW) { console.error('SEED_USER_PASSWORD missing in .env'); process.exit(2); }
const out = resolve(root, 'e2e/parity'); mkdirSync(out, { recursive: true });

const checks = [];
const check = (ok, msg) => { checks.push([ok, msg]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(90_000); // first compile in next dev on a WSL bind mount is slow

async function login(email) {
  await page.goto(`${base}/login`);
  await page.fill('#l-email', email);
  await page.fill('#l-pass', PW);
  await page.click('button[type=submit]');
}

// warm up: next dev compiles each route on first visit and may reload the page once; do that before checking
for (const path of ['/login', '/register', '/onboarding/org', '/o/lumen/dashboard', '/o/lumen/projects', '/invite#warmup-token-000']) {
  await page.goto(`${base}${path}`).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

// wrong password shows the locked error banner
await page.goto(`${base}/login`);
await page.fill('#l-email', 'priya@lumenfreight.test');
await page.fill('#l-pass', 'definitely-wrong-1');
await page.click('button[type=submit]');
await page.waitForSelector('.banner.error');
check((await page.textContent('.banner.error')).includes('Email or password is incorrect'), 'wrong password shows the error banner');
await page.screenshot({ path: resolve(out, 'stage3-login-error-desktop.png') });

// QA Engineer signs in and lands on the first workspace
const signInStart = Date.now();
await login('priya@lumenfreight.test');
await page.waitForURL('**/o/harbor/dashboard', { timeout: 90_000 }).catch(() => {});
await page.waitForURL(/\/o\/(lumen|harbor)\/dashboard/);
check(/\/o\/(harbor|lumen)\/dashboard$/.test(page.url()), `QA Engineer lands on a dashboard (${new URL(page.url()).pathname})`);
await page.goto(`${base}/o/lumen/dashboard`);
await page.waitForSelector('h1:has-text("Dashboard")');
console.log(`time from first sign in to the dashboard heading: ${((Date.now() - signInStart) / 1000).toFixed(1)} s`);
await page.waitForSelector(':text("Nothing to measure yet"), :text("Open bugs")', { timeout: 30_000 }).catch(() => {});
check(await page.isVisible('text=Nothing to measure yet') || await page.isVisible('text=Open bugs'), 'dashboard shows its figures or the empty state');
check(await page.locator('nav a:has-text("Members")').count() === 0, 'QA Engineer does not see Members');
check(await page.locator('a:has-text("Report bug")').count() === 1, 'QA Engineer sees Report bug');
await page.screenshot({ path: resolve(out, 'stage3-dashboard-desktop.png') });

// tokens: refresh token only in an httpOnly cookie scoped to /api/session; nothing in web storage
const cookies = await ctx.cookies();
const rt = cookies.find((c) => c.name === 'qp_rt');
check(!!rt && rt.httpOnly && rt.path === '/api/session' && rt.sameSite === 'Lax', 'refresh token is an httpOnly SameSite=Lax cookie on /api/session');
const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
check(!/eyJ|token/i.test(storage), 'no token in localStorage or sessionStorage');

// reload keeps the session (silent refresh through the cookie)
await page.reload();
await page.waitForSelector('h1:has-text("Dashboard")');
check(page.url().endsWith('/o/lumen/dashboard'), 'reload keeps the user signed in');

// org switcher lists both memberships and switches
await page.click('.org-switch');
check(await page.locator('.menu >> text=Harbor Clinics').count() === 1, 'org switcher lists Harbor Clinics');
await page.click('.menu >> text=Harbor Clinics');
await page.waitForURL('**/o/harbor/dashboard');
check(await page.locator('a:has-text("Report bug")').count() === 0, 'in Harbor Clinics Priya is a Viewer: no Report bug');

// a workspace the user is not in looks like a missing page
await page.goto(`${base}/o/tenant-a/dashboard`);
await page.waitForSelector('text=Page not found');
check(true, 'unknown or foreign workspace shows Page not found');

// sign out
await page.goto(`${base}/o/lumen/dashboard`);
await page.waitForSelector('.user-btn');
await page.click('.user-btn');
await page.click('.menu >> text=Sign out');
await page.waitForURL((u) => u.pathname === '/login');
check(new URL(page.url()).search === '', 'sign out goes to a plain sign in page (no return link to the old workspace)');
await page.goto(`${base}/o/lumen/dashboard`);
await page.waitForURL('**/login?next=*');
check(true, 'after sign out, app pages redirect to sign in');

// Org Admin sees admin navigation
await login('amara@lumenfreight.test');
await page.waitForURL('**/o/lumen/dashboard');
await page.waitForSelector('nav a:has-text("Members")');
check(await page.locator('nav a:has-text("AI usage")').count() === 1, 'Org Admin sees Members and AI usage');

// mobile shell
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.waitForSelector('h1:has-text("Dashboard")');
const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(over <= 0, `no sideways scroll at 390 px (${over})`);
await page.screenshot({ path: resolve(out, 'stage3-dashboard-mobile.png') });

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
await browser.close();
const failed = checks.filter(([ok]) => !ok).length;
console.log(failed ? `FAIL: ${failed} of ${checks.length} checks` : `PASS: ${checks.length} login checks`);
process.exit(failed ? 1 : 0);
