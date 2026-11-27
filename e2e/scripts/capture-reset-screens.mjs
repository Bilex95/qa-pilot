// I-23 screenshots for review (no locked design exists for these screens): forgot password, reset password (form, errors, link that no
// longer works), and the Members row with Reset password and its dialogs, at 1440 x 900 and 390 x 844.
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/capture-reset-screens.mjs
// Writes e2e/parity/stage4/i23/*.png. Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. The reset link
// is a secret: the link field is masked before any screenshot of the dialog and the token is never printed or written down. The
// fixture person (layout-i23@qapilot.test) is removed from the workspace again at the end.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveResetLinks, revokeResetLinks } from './revoke-reset-links.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000';
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i23');
mkdirSync(OUT, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const EMAIL = 'layout-i23@qapilot.test';
const plain = { 'Content-Type': 'application/json' };
const post = (headers, body) => ({ method: 'POST', headers, body: JSON.stringify(body) });

async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function admin() {
  const login = await fetch(`${API}/api/v1/auth/login`, post(plain, { email: 'amara@lumenfreight.test', password: PW }));
  const h = { ...plain, Authorization: `Bearer ${(await login.json()).access_token}` };
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: h })).json();
  return { h, org: `${API}/api/v1/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}` };
}
async function ok(res, what) { if (!res.ok) throw new Error(`${what}: ${res.status}`); return res.json(); }
async function members(h, org) { return (await ok(await fetch(`${org}/members?q=layout-i23&page_size=100`, { headers: h }), 'list members')).items.filter((m) => m.user.email === EMAIL); }
async function setup() {
  const { h, org } = await admin();
  let reg = await fetch(`${API}/api/v1/auth/register`, post(plain, { full_name: 'Layout I23 Person', email: EMAIL, password: PW }));
  if (reg.status === 409) reg = await fetch(`${API}/api/v1/auth/login`, post(plain, { email: EMAIL, password: PW }));
  const user = await ok(reg, 'register');
  if (!(await members(h, org)).length) {
    const inv = await ok(await fetch(`${org}/invitations`, post(h, { email: EMAIL, role: 'viewer' })), 'invite');
    await ok(await fetch(`${API}/api/v1/invitations/accept`, post({ ...plain, Authorization: `Bearer ${user.access_token}` }, { token: inv.invite_url.split('#').pop() })), 'accept');
  }
}
async function freshToken() {
  const { h, org } = await admin();
  const [m] = await members(h, org);
  return (await ok(await fetch(`${org}/members/${m.membership_id}/password-reset`, { method: 'POST', headers: h }), 'reset link')).reset_url.split('#').pop();
}
async function teardown() {
  const { h, org } = await admin();
  for (const m of await members(h, org)) await fetch(`${org}/members/${m.membership_id}`, { method: 'DELETE', headers: h });
}
const check = (condition, message) => { if (!condition) throw new Error(message); };
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(OUT, `${name}.png`) }); };

const browser = await chromium.launch();
const taken = [];
const touched = new Set([EMAIL]); // everyone this run may have created a reset link for: all of them are revoked at the end
try {
  await setup();
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    await setup(); // the reset page needs a real link for the fixture person
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);

    await page.goto(`${BASE}/login`);
    await page.waitForSelector('#l-email');
    await shot(page, `login-${label}`); taken.push(`login-${label}`);
    await page.goto(`${BASE}/forgot-password`);
    await page.waitForSelector('text=Forgot your password?');
    await shot(page, `forgot-password-${label}`); taken.push(`forgot-password-${label}`);

    const token = await freshToken();
    await page.goto(`${BASE}/reset-password#${token}`);
    await page.waitForSelector('#rp-new');
    await shot(page, `reset-password-${label}`); taken.push(`reset-password-${label}`);
    await fillStable(page, '#rp-new', 'short1');
    await fillStable(page, '#rp-confirm', 'other1');
    await page.click('button:has-text("Set password")');
    await page.waitForSelector('.auth-card .err');
    await shot(page, `reset-password-errors-${label}`); taken.push(`reset-password-errors-${label}`);
    await page.goto(`${BASE}/reset-password`);
    await page.waitForSelector('text=This reset link no longer works');
    await shot(page, `reset-password-invalid-${label}`); taken.push(`reset-password-invalid-${label}`);

    // The Members shots show the seeded list only: the fixture person is removed first and the list is not filtered. The dialogs open
    // on a seeded person who belongs to this workspace only (a person in two workspaces is refused); the first one that is accepted is used.
    await teardown();
    await page.goto(`${BASE}/login`);
    await fillStable(page, '#l-email', 'amara@lumenfreight.test');
    await fillStable(page, '#l-pass', PW);
    await page.click('button[type=submit]');
    await page.waitForURL('**/o/lumen/dashboard');
    await page.goto(`${BASE}/o/lumen/members`);
    await page.waitForSelector('table.t tbody tr');
    await page.waitForFunction(() => document.querySelectorAll('table.t:has(thead) tbody tr').length >= 10);
    check((await page.locator('table.t:has(thead) tbody tr', { hasText: '@qapilot.test' }).count()) === 0, 'the Members list must show seeded people only');
    await shot(page, `members-reset-row-${label}`); taken.push(`members-reset-row-${label}`);
    let linked = false;
    for (const who of ['hana@lumenfreight.test', 'sofia@lumenfreight.test', 'kwame@lumenfreight.test', 'mei@lumenfreight.test']) {
      await page.locator('table.t:has(thead) tbody tr', { hasText: who }).locator('button[aria-label^="Reset the password of"]').first().click();
      await page.waitForSelector('.modal');
      if (!taken.includes(`members-reset-confirm-${label}`)) { await shot(page, `members-reset-confirm-${label}`); taken.push(`members-reset-confirm-${label}`); }
      touched.add(who);
      await page.click('.modal button:has-text("Create reset link")');
      await page.waitForSelector('#reset-link, .modal .banner.error');
      if (await page.locator('#reset-link').count()) {
        await page.addStyleTag({ content: '#reset-link { -webkit-text-security: disc; }' }); // never capture the secret link
        await shot(page, `members-reset-link-${label}`); taken.push(`members-reset-link-${label}`);
        linked = true;
        break;
      }
      await page.click('.modal button:has-text("Done")'); // refused: this person is in two workspaces, try the next one
      await page.waitForSelector('.modal', { state: 'detached' });
    }
    if (!linked) throw new Error('no seeded person could be reset');
    await ctx.close();
  }
  console.log(`Captured ${taken.length} screenshots: ${taken.join(', ')}`);
} catch (err) {
  console.log(`FAIL: ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await teardown().catch((err) => console.log(`note: could not remove the fixture member: ${err.message}`));
  await browser.close();
  // No reset link may outlive the capture: revoke every link created for the fixture person and for the seeded person in the dialogs,
  // then check that none is live. A failure here fails the run.
  try {
    const emails = [...touched];
    const { before, revoked, after } = revokeResetLinks(emails);
    for (const e of emails) console.log(`reset links for ${e}: live before ${before[e]}, live after ${after[e]}`);
    console.log(`revoked ${revoked} live reset link(s); none is left`);
  } catch (err) {
    console.log(`FAIL: could not revoke the reset links: ${String(err.message || err).split(/\r?\n/)[0]}`);
    process.exitCode = 1;
  }
}
