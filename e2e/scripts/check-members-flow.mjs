// I-10 acceptance flow: an Org Admin invites someone, copies the link, and the new user accepts it (SCR-19, SCR-04).
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/check-members-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// The invite link is a secret. It is held in one variable, never printed, never written to a file or a screenshot, and
// removed from any error text before it is shown. Test users are named flow-i10-<timestamp>@qapilot.test so they are easy
// to find and clean up; the script removes the membership at the end (the user record stays, as in any registration).
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:3000');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const EMAIL = `flow-i10-${Date.now()}@qapilot.test`;
const NAME = 'Flow I10 Tester';
let secret = ''; // the invite link
const redact = (text) => {
  let out = String(text);
  if (secret) {
    const token = secret.split('/').filter(Boolean).pop();
    out = out.split(secret).join('[invite link]');
    if (token) out = out.split(token).join('[token]');
  }
  return out;
};
const log = (message) => console.log(`flow-i10: ${message}`);

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
  await page.waitForURL('**/o/lumen/dashboard');
}

// Removes every flow-i10-* member (this run's and any left by an earlier failed run) through the screen's own Remove dialog
async function removeFlowMembers(admin) {
  await admin.goto(`${BASE}/o/lumen/members`);
  await admin.waitForSelector('table.t tbody tr');
  await fillStable(admin, '#m-q', 'flow-i10-');
  let removed = 0;
  for (;;) {
    // wait for the filtered list: only flow-i10 rows, or the no results message
    await admin.waitForFunction(() => {
      const rows = [...document.querySelectorAll('table.t:has(thead) tbody tr')];
      const none = document.body.innerText.includes('No one matches your search or role filter.');
      return none || (rows.length > 0 && rows.every((r) => r.textContent.includes('flow-i10-')));
    });
    const rows = admin.locator('table.t:has(thead) tbody tr', { hasText: 'flow-i10-' });
    if ((await rows.count()) === 0) break;
    await rows.first().locator('button:has-text("Remove")').click();
    await admin.waitForSelector('.modal');
    await admin.click('.modal button:has-text("Remove member")');
    await admin.waitForSelector('.modal', { state: 'detached' });
    removed++;
    await admin.waitForTimeout(500); // let the list refetch before looking again
  }
  return removed;
}

// Revokes every pending flow-i10-* invitation (this run's and any left by an earlier failed run) through the screen's Revoke button
async function revokeFlowInvitations(admin) {
  await admin.goto(`${BASE}/o/lumen/members`);
  await admin.waitForSelector('text=Pending invitations');
  await admin.waitForSelector('table.t tbody tr');
  const buttons = admin.locator('button[aria-label^="Revoke the invitation for flow-i10-"]');
  let revoked = 0;
  while ((await buttons.count()) > 0) {
    await buttons.first().click();
    await admin.waitForSelector('text=Invitation revoked');
    revoked++;
    await admin.waitForTimeout(700); // let the list refetch and the toast go before looking again
  }
  return revoked;
}

const browser = await chromium.launch();
let failed = false;
let step = 'start';
let current = null; // the page being driven, to describe it when something fails
try {
  // 1. The Org Admin invites a new person
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  admin.setDefaultTimeout(60_000);
  current = admin;
  step = 'sign in as the Org Admin';
  await signIn(admin, 'amara@lumenfreight.test');
  step = 'remove test users left by earlier runs';
  const leftovers = await removeFlowMembers(admin);
  if (leftovers) log(`removed ${leftovers} test member(s) left by earlier runs`);
  step = 'revoke test invitations left by earlier runs';
  const staleInvites = await revokeFlowInvitations(admin);
  if (staleInvites) log(`revoked ${staleInvites} test invitation(s) left by earlier runs`);
  step = 'invite a new person';
  await admin.goto(`${BASE}/o/lumen/members`);
  await admin.waitForSelector('table.t tbody tr');
  await admin.click('button:has-text("Invite people")');
  await admin.waitForSelector('.modal');
  await fillStable(admin, '#inv-email', EMAIL);
  await admin.selectOption('#inv-role', 'developer');
  await admin.click('.modal button:has-text("Create invite link")');
  await admin.waitForSelector('#inv-link');
  secret = await admin.inputValue('#inv-link');
  if (!new URL(secret).pathname.startsWith('/invite/')) throw new Error('the invite link does not look like an invite link');
  log('invitation created, link shown once');
  await admin.click('.modal button:has-text("Done")');
  await admin.waitForSelector('.modal', { state: 'detached' });
  await admin.waitForSelector(`text=${EMAIL}`);
  log('the invitation is listed as pending');

  // 2. The new person opens the link, creates an account with the invited email and accepts
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  guest.setDefaultTimeout(60_000);
  step = 'open the invite link as a new person'; current = guest;
  await guest.goto(secret);
  await guest.waitForSelector('a.btn:has-text("Create an account")');
  step = 'create an account'; await guest.click('a.btn:has-text("Create an account")');
  await guest.waitForSelector('#r-name');
  await guest.waitForLoadState('networkidle');
  await fillStable(guest, '#r-name', NAME);
  await fillStable(guest, '#r-email', EMAIL);
  await fillStable(guest, '#r-pass', PW);
  step = 'register and return to the invitation'; await guest.click('button[type=submit]');
  await guest.waitForSelector('text=Accept and continue');
  step = 'accept the invitation'; await guest.click('text=Accept and continue');
  await guest.waitForURL('**/o/lumen/dashboard');
  log('the new user accepted the invitation and reached the workspace');

  // 3. The link works once
  const stranger = await (await browser.newContext()).newPage();
  stranger.setDefaultTimeout(60_000);
  await stranger.goto(secret);
  await stranger.waitForSelector('text=This invite link no longer works');
  log('the used link no longer works');

  // 4. The Org Admin sees the new member as a Developer and no pending invitation, then removes the member
  await admin.goto(`${BASE}/o/lumen/members`);
  await admin.waitForSelector('table.t tbody tr');
  await fillStable(admin, '#m-q', EMAIL);
  step = 'check the new member';
  const row = admin.locator('table.t tbody tr', { hasText: EMAIL });
  await row.waitFor();
  const role = await row.locator('select').inputValue();
  if (role !== 'developer') throw new Error(`the new member has role ${role}, expected developer`);
  if (await admin.locator(`section:has(h2:text("Pending invitations")) >> text=${EMAIL}`).count()) {
    throw new Error('the accepted invitation is still listed as pending');
  }
  log('the new member is a Developer and the invitation is no longer pending');
  current = admin;
  step = 'remove the test member';
  const removed = await removeFlowMembers(admin);
  if (removed !== 1) throw new Error(`expected to remove 1 test member, removed ${removed}`);
  log('the member was removed (test user record left: ' + EMAIL + ')');
} catch (e) {
  failed = true;
  console.log(`FAIL at step "${step}": ${redact(String(e.message || e).split(/\r?\n/)[0])}`);
  if (current) {
    const seen = await current.locator('h1, h2, .banner, .err').allInnerTexts().catch(() => []);
    console.log(`  the page showed: ${redact(seen.join(' | ').replace(/\s+/g, ' ')).slice(0, 300)}`);
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
console.log('PASS: invite, copy link, accept as a new user, link works once, member removed');
