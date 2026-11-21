// I-11 acceptance flow: Settings (SCR-20), the API refusals behind the hidden tabs, the audit log and the password change.
//
// Usage (from e2e/, stack up, baseline seeded):
//   powershell -File ../scripts/with-wsl.ps1 -Up node scripts/check-settings-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. The throw away person's passwords are generated
// per run and never printed. Nothing secret is written to a file or a screenshot.
//
// Test data: one person flow-i11-<timestamp>@qapilot.test (registered, invited as Developer, accepted through the API), one label
// "Flow I11 label", two audit events with the action flowi11.test, and a temporary change to the Lumen workspace settings. All of
// it is removed or restored in `finally`, also after a failure (the user record stays, as in any registration).
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { psql, revokeResetLinks } from './revoke-reset-links.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:3000');
const API = arg('--api', 'http://localhost:8000');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const RUN = Date.now();
const EMAIL = `flow-i11-${RUN}@qapilot.test`;
const NAME = 'Flow I11 Tester';
const NAME2 = 'Flow I11 Renamed';
const PASS_A = `Flow-${RUN}-aA1`;
const PASS_B = `Flow-${RUN}-bB2`;
const LABEL = 'Flow I11 label';
const EVENT_ACTION = 'flowi11.test';
const log = (m) => console.log(`flow-i11: ${m}`);
const check = (c, m) => { if (!c) throw new Error(m); };

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 */ }
  return { status: res.status, json };
}
async function login(email, password) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password } });
  check(r.status === 200, `could not sign in ${email.split('@')[0]}: ${r.status}`);
  return r.json.access_token;
}
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
  await page.waitForURL('**/o/lumen/dashboard');
}
const tabs = async (page) => (await page.locator('[role=tab]').allInnerTexts()).map((t) => t.trim());
const activeTab = async (page) => (await page.locator('[role=tab][aria-selected=true]').innerText()).trim();
async function openSettings(page, tab) {
  await page.goto(`${BASE}/o/lumen/settings${tab ? `?tab=${tab}` : ''}`);
  await page.waitForSelector('[role=tab]');
}

const state = { orgId: '', original: null, adminToken: '', labelId: '', membershipId: '', eventsInserted: false };

async function cleanup() {
  const notes = [];
  if (state.original && state.adminToken) {
    const r = await api(`/orgs/${state.orgId}`, { method: 'PATCH', token: state.adminToken, body: state.original });
    const back = await api(`/orgs/${state.orgId}`, { token: state.adminToken });
    const ok = r.status === 200 && back.json.name === state.original.name && back.json.ai_enabled === state.original.ai_enabled
      && back.json.ai_daily_limit === state.original.ai_daily_limit;
    notes.push(ok ? 'workspace settings restored' : 'WORKSPACE SETTINGS NOT RESTORED');
  }
  if (state.labelId) {
    const r = await api(`/orgs/${state.orgId}/labels/${state.labelId}`, { method: 'DELETE', token: state.adminToken });
    notes.push(`label removed (${r.status})`);
  }
  if (state.membershipId) {
    const r = await api(`/orgs/${state.orgId}/members/${state.membershipId}`, { method: 'DELETE', token: state.adminToken });
    notes.push(`member removed (${r.status})`);
  }
  if (state.eventsInserted) {
    psql(`delete from audit_events where action = '${EVENT_ACTION}';`);
    notes.push('test audit events deleted');
  }
  try { await revokeResetLinks([EMAIL]); } catch (e) { notes.push(`reset link check failed: ${e.message}`); }
  log(`cleanup: ${notes.join(', ')}`);
}

async function main() {
  // 1. The Lumen workspace and the people by role
  state.adminToken = await login('amara@lumenfreight.test', PW);
  const orgs = await api('/orgs', { token: state.adminToken });
  state.orgId = orgs.json.find((o) => o.org.slug === 'lumen').org.id;
  const O = `/orgs/${state.orgId}`;
  const org = (await api(O, { token: state.adminToken })).json;
  state.original = { name: org.name, ai_enabled: org.ai_enabled, ai_daily_limit: org.ai_daily_limit };
  const members = (await api(`${O}/members?page_size=100`, { token: state.adminToken })).json.items;
  const byRole = (role) => members.find((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test') && m.user.email !== 'amara@lumenfreight.test')?.user.email;
  const lead = byRole('qa_lead'); const viewer = byRole('viewer'); const developer = byRole('developer');
  check(lead && viewer && developer, 'the baseline seed has no QA Lead, Viewer or Developer');
  log(`workspace "${org.name}", AI ${org.ai_enabled ? 'on' : 'off'}, limit ${org.ai_daily_limit}`);

  // 2. The API itself refuses what the hidden tabs hide: QA Lead, Developer and Viewer, called directly
  const created = await api(`${O}/labels`, { method: 'POST', token: await login(lead, PW), body: { name: LABEL } });
  check(created.status === 201, `QA Lead could not create a label: ${created.status}`);
  state.labelId = created.json.id;
  for (const [role, email] of [['QA Lead', lead], ['Developer', developer], ['Viewer', viewer]]) {
    const t = await login(email, PW);
    const audit = await api(`${O}/audit-events`, { token: t });
    const actors = await api(`${O}/audit-events/actors`, { token: t });
    const patch = await api(O, { method: 'PATCH', token: t, body: { name: 'Hijacked name', ai_enabled: false, ai_daily_limit: 1 } });
    check(audit.status === 403 && audit.json.error.code === 'forbidden', `${role}: audit log answered ${audit.status}`);
    check(actors.status === 403, `${role}: audit actors answered ${actors.status}`);
    check(patch.status === 403, `${role}: workspace settings PATCH answered ${patch.status}`);
    if (role !== 'QA Lead') {
      const post = await api(`${O}/labels`, { method: 'POST', token: t, body: { name: 'Flow I11 refused' } });
      const del = await api(`${O}/labels/${state.labelId}`, { method: 'DELETE', token: t });
      check(post.status === 403, `${role}: creating a label answered ${post.status}`);
      check(del.status === 403, `${role}: deleting a label answered ${del.status}`);
    }
    check((await api(`${O}/labels`, { token: t })).status === 200, `${role}: listing labels is open to every role`);
    log(`${role}: audit 403, actors 403, settings 403${role === 'QA Lead' ? ', labels allowed' : ', label create and delete 403'}`);
  }
  const after = (await api(O, { token: state.adminToken })).json;
  check(after.name === state.original.name && after.ai_enabled === state.original.ai_enabled && after.ai_daily_limit === state.original.ai_daily_limit,
    'a refused settings change still changed the workspace');
  log('the refused changes changed nothing');

  // 3. A throw away Developer (register, invite, accept), who also tests the profile and the password
  const reg = await api('/auth/register', { method: 'POST', body: { full_name: NAME, email: EMAIL, password: PASS_A } });
  check(reg.status === 201, `could not register the throw away person: ${reg.status}`);
  const invite = await api(`${O}/invitations`, { method: 'POST', token: state.adminToken, body: { email: EMAIL, role: 'developer' } });
  check(invite.status === 201, `could not invite: ${invite.status}`);
  let inviteToken = invite.json.invite_url.split('#').pop();
  const personToken = await login(EMAIL, PASS_A);
  const accept = await api('/invitations/accept', { method: 'POST', token: personToken, body: { token: inviteToken } });
  inviteToken = '';
  check(accept.status === 200 || accept.status === 201, `could not accept: ${accept.status}`);
  state.membershipId = (await api(`${O}/members?page_size=100&q=${encodeURIComponent(EMAIL)}`, { token: state.adminToken })).json.items[0].membership_id;
  log('a throw away Developer joined the workspace');

  const browser = await chromium.launch();
  try {
    // 4. Tabs per role in the screen, and the fall back for a tab the role may not use
    const ctxAdmin = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Paris', locale: 'en-GB' });
    const admin = await ctxAdmin.newPage();
    await signIn(admin, 'amara@lumenfreight.test', PW);
    await openSettings(admin);
    check(JSON.stringify(await tabs(admin)) === JSON.stringify(['Organization', 'Labels', 'Audit log', 'My profile']), `Org Admin tabs: ${await tabs(admin)}`);
    check((await activeTab(admin)) === 'Organization', 'Org Admin starts on Organization');

    for (const [role, email, expected] of [['QA Lead', lead, ['Labels', 'My profile']], ['Viewer', viewer, ['My profile']]]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await signIn(page, email, PW);
      await openSettings(page);
      check(JSON.stringify(await tabs(page)) === JSON.stringify(expected), `${role} tabs: ${await tabs(page)}`);
      for (const asked of ['audit', 'org']) {
        await openSettings(page, asked);
        check((await activeTab(page)) === 'My profile', `${role} asking for ?tab=${asked} should land on My profile, got ${await activeTab(page)}`);
        check((await page.locator('#p-name').count()) === 1 && (await page.locator('#s-name').count()) === 0, `${role}: ?tab=${asked} showed another tab's content`);
      }
      await ctx.close();
      log(`${role} sees ${expected.join(' and ')}; ?tab=audit and ?tab=org fall back to My profile`);
    }

    // 5. Organization: name, AI switch and the daily limit (disabled and kept while AI is off)
    await openSettings(admin, 'org');
    await admin.waitForSelector('#s-name');
    await fillStable(admin, '#s-name', `${state.original.name} (flow i11)`);
    await admin.click('button:has-text("Save changes")');
    await admin.getByText('Settings saved').waitFor();
    check((await api(O, { token: state.adminToken })).json.name === `${state.original.name} (flow i11)`, 'the workspace name was not saved');
    log('the workspace name saved');

    const limitBefore = String(state.original.ai_daily_limit);
    await admin.waitForSelector('#s-ai');
    if (!(await admin.isChecked('#s-ai'))) { await admin.click('label.switch'); await admin.click('button:has-text("Save AI settings")'); await admin.getByText('AI settings saved').waitFor(); }
    await admin.click('label.switch'); // AI off
    check(!(await admin.isChecked('#s-ai')), 'the switch did not turn off');
    check(await admin.isDisabled('#s-lim'), 'the daily limit is not disabled while AI is off');
    check((await admin.inputValue('#s-lim')) === limitBefore, 'the daily limit value was not kept while AI is off');
    check((await admin.locator('#s-lim').count()) === 1 && await admin.locator('#s-lim').isVisible(), 'the daily limit must stay visible while AI is off');
    await admin.click('button:has-text("Save AI settings")');
    await admin.getByText('AI settings saved').waitFor();
    const off = (await api(O, { token: state.adminToken })).json;
    check(off.ai_enabled === false && off.ai_daily_limit === Number(limitBefore), `after AI off: ${off.ai_enabled}, limit ${off.ai_daily_limit}`);
    const me = (await api('/auth/me', { token: state.adminToken })).json;
    check(me.memberships.find((m) => m.org.id === state.orgId).org.ai_enabled === false, '/auth/me still says AI is on');
    await admin.reload();
    await admin.waitForSelector('#s-ai');
    check(!(await admin.isChecked('#s-ai')) && await admin.isDisabled('#s-lim') && (await admin.inputValue('#s-lim')) === limitBefore, 'after a reload AI off, the limit disabled and kept');
    log(`AI off: the limit field is disabled, visible and still ${limitBefore}; the API and /auth/me agree`);
    await admin.click('label.switch'); // AI on again
    check(!(await admin.isDisabled('#s-lim')), 'the limit stays disabled after AI is switched on');
    await fillStable(admin, '#s-lim', '321');
    await admin.click('button:has-text("Save AI settings")');
    await admin.getByText('AI settings saved').waitFor();
    const on = (await api(O, { token: state.adminToken })).json;
    check(on.ai_enabled === true && on.ai_daily_limit === 321, `after AI on: ${on.ai_enabled}, limit ${on.ai_daily_limit}`);
    await fillStable(admin, '#s-lim', '0');
    await admin.click('button:has-text("Save AI settings")');
    await admin.getByText('Use a number from 1 to 100000.').waitFor();
    log('the limit saved (321) and 0 is refused with a message');

    // 6. The person changes their name and password in the screen (their own session, on a new context)
    const ctxPerson = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const person = await ctxPerson.newPage();
    await signIn(person, EMAIL, PASS_A);
    await person.click('button[aria-label^="Account menu"]');
    await person.click('a:has-text("My profile")');
    await person.waitForURL('**/settings?tab=profile');
    await person.waitForSelector('#p-name');
    check((await activeTab(person)) === 'My profile' && (await person.inputValue('#p-email')) === EMAIL && await person.isDisabled('#p-email'), 'the profile shows the email, read only');
    await fillStable(person, '#p-name', NAME2);
    await person.click('button:has-text("Save profile")');
    await person.getByText('Profile saved').waitFor();
    check((await api('/auth/me', { token: await login(EMAIL, PASS_A) })).json.user.full_name === NAME2, 'the name was not saved');
    log('the name saved');

    const otherDevice = await login(EMAIL, PASS_A); // a second session, which the password change must end
    for (const [cur, next, conf, message] of [
      ['Not-my-password-1', PASS_B, PASS_B, 'That is not your current password.'],
      [PASS_A, PASS_B, `${PASS_B}x`, 'The two passwords do not match.'],
      [PASS_A, 'short1', 'short1', 'Use at least 10 characters.'],
    ]) {
      await fillStable(person, '#p-cur', cur);
      await fillStable(person, '#p-new', next);
      await fillStable(person, '#p-confirm', conf);
      await person.click('button:has-text("Change password")');
      await person.getByText(message).waitFor();
    }
    log('a wrong current password, a mismatch and a weak password are refused with messages');
    await fillStable(person, '#p-cur', PASS_A);
    await fillStable(person, '#p-new', PASS_B);
    await fillStable(person, '#p-confirm', PASS_B);
    await person.click('button:has-text("Change password")');
    await person.getByText('Password changed. Other devices were signed out.').waitFor();
    check((await person.inputValue('#p-cur')) === '', 'the password fields were not emptied');
    check((await api('/auth/me', { token: otherDevice })).status === 401, 'another session still works after the password change');
    check((await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS_A } })).status === 401, 'the old password still works');
    check((await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS_B } })).status === 200, 'the new password does not work');
    await person.reload(); // the refresh cookie was replaced with the new pair, so this device stays signed in
    await person.waitForSelector('#p-name');
    check(person.url().includes('/settings'), `this device was signed out by its own password change (${person.url()})`);
    await person.goto(`${BASE}/o/lumen/dashboard`);
    await person.waitForSelector('h1');
    check(person.url().includes('/dashboard'), 'this device was sent to sign in after the password change');
    log('the password changed: this device stays signed in, another session ended, the old password is refused');
    await ctxPerson.close();

    // 7. The audit log: what was recorded, the person's name after removal, filters and the local day range at UTC+1
    state.eventsInserted = true;
    psql(`insert into audit_events (id, created_at, org_id, actor_id, action, entity_type, data) `
      + `select gen_random_uuid(), t.at::timestamptz, o.id, u.id, '${EVENT_ACTION}', 'test', '{}'::jsonb `
      + `from organizations o, users u, (values ('2026-03-10 22:30:00+00'), ('2026-03-10 23:30:00+00')) as t(at) `
      + `where o.slug = 'lumen' and u.email = 'amara@lumenfreight.test';`);
    // In Paris (UTC+1 in March) 22:30 UTC is 23:30 on 10 March and 23:30 UTC is 00:30 on 11 March
    const removal = await api(`${O}/members/${state.membershipId}`, { method: 'DELETE', token: state.adminToken });
    check(removal.status === 204, `could not remove the person: ${removal.status}`);
    state.membershipId = '';

    const auditUrls = [];
    admin.on('request', (r) => { if (r.url().includes('/audit-events?')) auditUrls.push(decodeURIComponent(r.url())); });
    await openSettings(admin, 'audit');
    await admin.waitForSelector('table.t tbody tr');
    const body = () => admin.locator('table.t tbody').innerText();
    const bodyText = await body();
    check(bodyText.includes('Changed their own password') && bodyText.includes(NAME2), 'the password change or the new name is missing from the log');
    check(bodyText.includes('AI features turned off') || bodyText.includes('AI features turned on') || bodyText.includes('Daily limit'), 'the AI changes are missing from the log');
    check(bodyText.includes(`Name ${state.original.name} to ${state.original.name} (flow i11)`) || bodyText.includes('(flow i11)'), 'the workspace rename is missing from the log');
    check(!bodyText.includes(PASS_A) && !bodyText.includes(PASS_B), 'a password appears in the log');
    check(bodyText.includes(`Removed ${NAME2} from the workspace`), 'the removal does not name the person it was about');
    log('the log shows the name change, the AI changes and the password change, by name, and no password');

    const who = admin.locator('select[aria-label="Who"]');
    check((await who.locator('option').allInnerTexts()).includes(NAME2), 'the person removed from the workspace is not offered in the Who filter');
    await who.selectOption({ label: NAME2 });
    await admin.waitForFunction((n) => [...document.querySelectorAll('table.t tbody tr')].length > 0
      && [...document.querySelectorAll('table.t tbody tr')].every((r) => r.textContent.includes(n)), NAME2);
    log('the person removed from the workspace still has a name in the log and in the Who filter');
    await who.selectOption({ label: 'Everyone' });

    await admin.selectOption('select[aria-label="Action"]', { label: 'AI controls' });
    await admin.waitForFunction(() => [...document.querySelectorAll('table.t tbody tr')].length > 0
      && [...document.querySelectorAll('table.t tbody tr')].every((r) => r.textContent.includes('ai.')));
    await admin.selectOption('select[aria-label="Action"]', { label: 'All actions' });

    const rowsWith = async () => (await admin.locator('table.t tbody tr', { hasText: EVENT_ACTION }).count());
    const range = async (from, to) => {
      await admin.fill('input[aria-label="From date"]', from);
      await admin.fill('input[aria-label="To date"]', to);
      await admin.waitForTimeout(600);
      await admin.waitForLoadState('networkidle');
    };
    const eventTimes = async () => (await admin.locator('table.t tbody tr', { hasText: EVENT_ACTION }).locator('td:first-child span').evaluateAll((els) => els.map((e) => e.title)));
    await range('2026-03-10', '2026-03-10'); // 10 March in Paris: only the event at 23:30 local
    check((await rowsWith()) === 1, `10 March to 10 March should hold exactly the 23:30 local event, found ${await rowsWith()}`);
    check((await eventTimes())[0].includes('23:30'), `the 10 March event should be at 23:30 local, it is ${(await eventTimes())[0]}`);
    await range('2026-03-11', '2026-03-11'); // 11 March in Paris: only the event at 00:30 local
    check((await rowsWith()) === 1, `11 March to 11 March should hold exactly the 00:30 local event, found ${await rowsWith()}`);
    check((await eventTimes())[0].includes('00:30'), `the 11 March event should be at 00:30 local, it is ${(await eventTimes())[0]}`);
    await range('2026-03-10', '2026-03-11');
    check((await rowsWith()) === 2, `10 to 11 March should hold both events, found ${await rowsWith()}`);
    await admin.fill('input[aria-label="From date"]', '2026-03-12');
    await admin.getByText('The end date is before the start date').waitFor();
    const sent = auditUrls.filter((u) => u.includes('from=') || u.includes('to='));
    check(sent.some((u) => u.includes('from=2026-03-09T23:00:00.000Z') && u.includes('to=2026-03-10T22:59:59.999Z')), 'the 10 March request did not send the local day as UTC (23:00Z to 22:59:59.999Z)');
    check(sent.some((u) => u.includes('from=2026-03-10T23:00:00.000Z') && u.includes('to=2026-03-11T22:59:59.999Z')), 'the 11 March request did not send the local day as UTC');
    log('Paris (UTC+1): a 23:30 evening event is inside its own day and a 00:30 event is in the next; the range is sent as UTC');
    await ctxAdmin.close();
  } finally {
    await browser.close();
  }
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error(`flow-i11: FAIL ${e.message}`);
}
try { await cleanup(); } catch (e) { failed = true; console.error(`flow-i11: cleanup failed: ${e.message}`); }
if (failed) process.exit(1);
console.log('flow-i11: PASS');
