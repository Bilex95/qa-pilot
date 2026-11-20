// I-23 acceptance flow (SCR-01 forgot password, reset password page, SCR-19 Reset password action; D-045, D-055): an Org Admin
// creates a reset link for a member, the person sets a new password with it, every old session ends, the link works once, and
// the token never appears in a URL, a Referer header, the console or browser storage.
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/check-reset-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. The reset link is a secret: it is held in one
// variable, never printed or saved to a file or screenshot, and removed from any error text before it is shown.
//
// Test users are named flow-i23-<timestamp>@qapilot.test. The script removes their membership and invitations in finally, also
// those left by an earlier failed run (the user records stay, as in any registration).
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

const PREFIX = 'flow-i23-';
const EMAIL = `${PREFIX}${Date.now()}@qapilot.test`;
const NEW_PW = `Flow-reset-${Date.now()}-ok`;
const log = (message) => console.log(`flow-i23: ${message}`);
const check = (condition, message) => { if (!condition) throw new Error(message); };
let secret = ''; // the reset link
const redact = (text) => {
  let out = String(text);
  if (secret) {
    const token = secret.split('#').pop();
    out = out.split(secret).join('[reset link]');
    if (token) out = out.split(token).join('[token]');
  }
  return out;
};

async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', password);
  await page.click('button[type=submit]');
}
const json = (h, body, method = 'POST') => ({ method, headers: h, body: JSON.stringify(body) });

async function admin() {
  const login = await fetch(`${API}/api/v1/auth/login`, json({ 'Content-Type': 'application/json' }, { email: 'amara@lumenfreight.test', password: PW }));
  if (!login.ok) throw new Error(`could not sign in the Org Admin: ${login.status}`);
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await login.json()).access_token}` };
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: h })).json();
  return { h, org: `${API}/api/v1/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}` };
}
async function cleanup() {
  const { h, org } = await admin();
  const members = await (await fetch(`${org}/members?q=${PREFIX}&page_size=100`, { headers: h })).json();
  for (const m of members.items.filter((x) => (x.user.email ?? '').startsWith(PREFIX))) await fetch(`${org}/members/${m.membership_id}`, { method: 'DELETE', headers: h });
  const pending = await (await fetch(`${org}/invitations?status=pending`, { headers: h })).json();
  for (const i of pending.filter((x) => x.email.startsWith(PREFIX))) await fetch(`${org}/invitations/${i.id}`, { method: 'DELETE', headers: h });
  return members.items.length;
}

// Records every request URL and Referer header, every console message and the browser storage of a page: the token must be in none
function recorder(context, page) {
  const seen = [];
  context.on('request', async (r) => { seen.push(r.url()); seen.push(`referer:${(await r.allHeaders().catch(() => ({}))).referer ?? ''}`); });
  page.on('console', (m) => seen.push(`console:${m.text()}`));
  page.on('pageerror', (e) => seen.push(`pageerror:${e.message}`));
  return seen;
}
async function storageText(page) {
  return page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
}

const browser = await chromium.launch();
let failed = false;
let step = 'start';
let current = null;
try {
  step = 'remove leftovers of earlier runs';
  const stale = await cleanup();
  if (stale) log(`removed ${stale} test member(s) left by earlier runs`);

  // Setup through the API: a new person registers, is invited as a Viewer and accepts. They belong to one workspace only.
  step = 'set up a member to reset';
  const { h, org } = await admin();
  const reg = await fetch(`${API}/api/v1/auth/register`, json({ 'Content-Type': 'application/json' }, { full_name: 'Flow I23 Tester', email: EMAIL, password: PW }));
  check(reg.ok, `could not register the test user: ${reg.status}`);
  const userToken = (await reg.json()).access_token;
  const inv = await fetch(`${org}/invitations`, json(h, { email: EMAIL, role: 'viewer' }));
  check(inv.ok, `could not invite the test user: ${inv.status}`);
  const inviteToken = (await inv.json()).invite_url.split('#').pop();
  const acc = await fetch(`${API}/api/v1/invitations/accept`, json({ 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` }, { token: inviteToken }));
  check(acc.ok, `could not accept the invitation: ${acc.status}`);

  // The person is signed in on a device (the session that must end)
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const personal = await ctxA.newPage();
  personal.setDefaultTimeout(60_000);
  step = 'the person signs in on a device';
  await signIn(personal, EMAIL, PW);
  await personal.waitForURL('**/o/lumen/dashboard');
  log('the person is signed in on one device');

  // 1. The Org Admin creates the link from the Members row
  step = 'the Org Admin opens Members';
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admPage = await adminCtx.newPage();
  admPage.setDefaultTimeout(60_000);
  current = admPage;
  await signIn(admPage, 'amara@lumenfreight.test', PW);
  await admPage.waitForURL('**/o/lumen/dashboard');
  await admPage.goto(`${BASE}/o/lumen/members`);
  await admPage.waitForSelector('table.t tbody tr');
  await fillStable(admPage, '#m-q', EMAIL);
  const row = admPage.locator('table.t tbody tr', { hasText: EMAIL });
  await row.waitFor();
  step = 'an admin has no Reset password on their own row';
  await fillStable(admPage, '#m-q', 'amara@lumenfreight.test');
  const own = admPage.locator('table.t tbody tr', { hasText: 'amara@lumenfreight.test' });
  await own.waitFor();
  check((await own.locator('button[aria-label^="Reset the password of"]').count()) === 0, 'your own row must not offer Reset password');
  log('your own row has no Reset password action');

  step = 'a person in two workspaces is refused';
  await fillStable(admPage, '#m-q', 'priya@lumenfreight.test');
  const shared = admPage.locator('table.t tbody tr', { hasText: 'priya@lumenfreight.test' });
  await shared.waitFor();
  await shared.locator('button[aria-label^="Reset the password of"]').click();
  await admPage.waitForSelector('.modal');
  await admPage.click('.modal button:has-text("Create reset link")');
  await admPage.waitForSelector('.modal .banner.error');
  check((await admPage.innerText('.modal .banner.error')).includes('more than one workspace'), 'the refusal should say the person belongs to more than one workspace');
  await admPage.click('.modal button:has-text("Done")');
  await admPage.waitForSelector('.modal', { state: 'detached' });
  log('the reset of a person in two workspaces is refused with an explanation');

  step = 'the Org Admin creates the reset link';
  await fillStable(admPage, '#m-q', EMAIL);
  await row.waitFor();
  await row.locator('button[aria-label^="Reset the password of"]').click();
  await admPage.waitForSelector('.modal');
  check((await admPage.innerText('.modal')).includes('signed out on every device'), 'the confirmation should say that the person is signed out everywhere');
  await admPage.click('.modal button:has-text("Create reset link")');
  await admPage.waitForSelector('#reset-link');
  secret = await admPage.inputValue('#reset-link');
  const u = new URL(secret);
  check(u.pathname === '/reset-password' && u.search === '' && u.hash.length > 40, 'the link should be /reset-password with the token in the fragment only');
  log('the link was created: the token is in the fragment, not in the path or the query');
  await admPage.click('.modal button:has-text("Done")');
  await admPage.waitForSelector('.modal', { state: 'detached' });
  check(!(await admPage.content()).includes(secret.split('#').pop()), 'the link must be gone from the page after the dialog closes');

  // 2. The person opens the link in a fresh browser (no session)
  step = 'the person opens the reset link';
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await ctxB.newPage();
  guest.setDefaultTimeout(60_000);
  current = guest;
  const seen = recorder(ctxB, guest);
  await guest.goto(secret);
  await guest.waitForSelector('#rp-new');
  check(new URL(guest.url()).hash === '', 'the fragment must be removed from the address bar');
  check(await guest.evaluate(() => location.hash === '' && location.search === ''), 'no hash or query left');
  await guest.waitForSelector('text=Set a new password');
  log('the page read the token, removed it from the address bar, and shows the form with the masked email');

  // A second link opened in a tab that is already on /reset-password only changes the hash (no reload): the page must use the new
  // token each time and clear it from the address bar again. A shows the form; a bad link must replace it with the "no longer
  // works" state; then a newer link B (which revokes A) must show the form again, and B is the link used from here on.
  step = 'open a second link in the same tab';
  const tokenA = secret.split('#').pop();
  const sameTab = async (token) => {
    await guest.evaluate((t) => { location.hash = t; }, token); // a hash change: no reload, like pasting a link into this tab
    await guest.waitForFunction(() => location.hash === '', null, { timeout: 15_000 }); // the fragment is cleared again
    check(await guest.evaluate(() => location.search === ''), 'the address bar must carry no query after a second link');
  };
  await sameTab('z'.repeat(43)); // looks like a token but is not one
  await guest.waitForSelector('text=This reset link no longer works');
  check((await guest.locator('#rp-new').count()) === 0, 'a bad second link must not leave the form of the first link on screen');
  log('a bad second link replaced the form with the "no longer works" state, and the address bar is clean');
  const { h: adminHeaders, org: orgUrl } = await admin();
  const found = (await (await fetch(`${orgUrl}/members?q=${EMAIL}&page_size=100`, { headers: adminHeaders })).json()).items.find((m) => m.user.email === EMAIL);
  const second = await fetch(`${orgUrl}/members/${found.membership_id}/password-reset`, { method: 'POST', headers: adminHeaders });
  check(second.ok, `could not create a second reset link: ${second.status}`);
  const tokenB = (await second.json()).reset_url.split('#').pop();
  check(tokenB !== tokenA, 'a newer link must be a different token');
  await sameTab(tokenB);
  await guest.waitForSelector('#rp-new');
  check((await guest.locator('text=This reset link no longer works').count()) === 0, 'the valid second link must replace the error state');
  secret = `${BASE}/reset-password#${tokenB}`; // from here on the newer link is the one in use
  log('a newer link opened in the same tab was used (the form is back) and its token was cleared from the address bar');
  const late2 = await (await browser.newContext()).newPage();
  late2.setDefaultTimeout(60_000);
  await late2.goto(`${BASE}/reset-password#${tokenA}`);
  await late2.waitForSelector('text=This reset link no longer works');
  await late2.context().close();
  log('the first link was revoked by the newer one');

  step = 'the person tries bad passwords';
  await fillStable(guest, '#rp-new', 'short1');
  await fillStable(guest, '#rp-confirm', 'short1');
  await guest.click('button:has-text("Set password")');
  await guest.waitForSelector('text=Use at least 10 characters.');
  await fillStable(guest, '#rp-new', NEW_PW);
  await fillStable(guest, '#rp-confirm', `${NEW_PW}x`);
  await guest.click('button:has-text("Set password")');
  await guest.waitForSelector('text=The two passwords do not match.');
  log('a weak password and a mismatch are refused on the screen');

  step = 'the person sets the new password';
  await fillStable(guest, '#rp-confirm', NEW_PW);
  await guest.click('button:has-text("Set password")');
  await guest.waitForSelector('text=Password changed');
  const token = secret.split('#').pop();
  check(seen.length > 5, 'the recorder should have seen the requests of this person'); // a recorder that saw nothing would prove nothing
  const leaks = seen.filter((s) => s.includes(token) || s.includes(tokenA)); // the first link must not leak either
  check(leaks.length === 0, `the token must not appear in any request URL, Referer header or console message (found in ${leaks.length})`);
  check(!(await storageText(guest)).includes(token), 'the token must not be in local storage, session storage or cookies');
  log('the new password is set; the token appeared in no request URL, Referer header, console message or browser storage');

  // 3. Every old session ends, the new password works, the old one does not, the link works once
  step = 'the old session ends';
  current = personal;
  await personal.goto(`${BASE}/o/lumen/dashboard`);
  await personal.waitForURL((url) => url.pathname === '/login', { timeout: 30_000 });
  log('the device that was signed in is signed out');

  step = 'the old password is refused and the new one works';
  const login = await ctxB.newPage();
  await signIn(login, EMAIL, PW);
  await login.waitForSelector('text=Email or password is incorrect');
  await signIn(login, EMAIL, NEW_PW);
  await login.waitForURL('**/o/lumen/dashboard');
  log('the old password is refused and the new password signs in');

  step = 'the link works once';
  const late = await (await browser.newContext()).newPage();
  late.setDefaultTimeout(60_000);
  await late.goto(secret);
  await late.waitForSelector('text=This reset link no longer works');
  log('the used link no longer works');
  await late.goto(`${BASE}/reset-password`);
  await late.waitForSelector('text=This reset link no longer works');
  log('the reset page without a token says the link is incomplete or no longer works');
} catch (e) {
  failed = true;
  console.log(`FAIL at step "${step}": ${redact(String(e.message || e).split(/\r?\n/)[0])}`);
  if (current) {
    const seenText = await current.locator('h1, h2, .banner, .err').allInnerTexts().catch(() => []);
    console.log(`  the page showed: ${redact(seenText.join(' | ').replace(/\s+/g, ' ')).slice(0, 300)}`);
  }
} finally {
  await cleanup().then((n) => log(`cleanup: removed ${n} test member(s) and any pending test invitation`)).catch((e) => console.log(`note: cleanup failed: ${e.message}`));
  await browser.close();
}
if (failed) process.exit(1);
console.log('PASS: reset link from the Members row, set a new password, every old session ends, the link works once, no token leaks');
