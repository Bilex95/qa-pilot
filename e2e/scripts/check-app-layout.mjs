// Responsive and popup checks for the real app (standing rule from the Stage 3 gate, D-044).
// Fails when anything overflows the viewport, a popup is cut off, text is clipped or too small,
// or a tap target is under 44 px on touch widths.
//
// Usage (from e2e/, stack up, baseline seeded):
//   node scripts/check-app-layout.mjs [--base http://localhost:3000] [--shots ../e2e/parity/stage3-fix/after]
// Reads SEED_USER_PASSWORD from ../.env or the environment. Never prints it.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:3000');
const API = arg('--api', 'http://localhost:8000');
const SHOTS = arg('--shots', null);
const ONLY = arg('--only', null); // run a single viewport label, for debugging
const TRACE = process.argv.includes('--trace');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Widths from the standing rule; 200% zoom is emulated as half the CSS width at device scale 2.
const VIEWPORTS = [
  { label: '360', width: 360, height: 780, scale: 1 },
  { label: '390', width: 390, height: 844, scale: 1 },
  { label: '768', width: 768, height: 1024, scale: 1 },
  { label: '1024', width: 1024, height: 768, scale: 1 },
  { label: '1280', width: 1280, height: 800, scale: 1 },
  { label: '1440', width: 1440, height: 900, scale: 1 },
  { label: '1920', width: 1920, height: 1080, scale: 1 },
  { label: '2560', width: 2560, height: 1440, scale: 1 },
  { label: '1280-zoom200', width: 640, height: 400, scale: 2 },
  { label: '1920-zoom200', width: 960, height: 540, scale: 2 },
];
const TOUCH_MAX = 1024; // 44 px targets at or below this CSS width (D-035)
const POPUP_MARGIN = 4;

// Long text fixture (rule 4): a person and a workspace with very long names, created through the public API.
const LONG = {
  email: 'maximiliana.alexandrina.featherstonehaugh.montgomery@a-very-long-company-domain-name.test',
  name: 'Maximiliana Alexandrina Featherstonehaugh Montgomery Wolfeschlegelsteinhausen',
  org: 'International Freight Forwarding Quality Assurance and Release Engineering Group',
  slug: 'long-name-layout-fixture',
};

async function ensureLongFixture() {
  const login = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LONG.email, password: PW }) });
  let token;
  if (login.ok) token = (await login.json()).access_token;
  else {
    const reg = await fetch(`${API}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: LONG.name, email: LONG.email, password: PW }) });
    if (!reg.ok) throw new Error(`could not create the long text fixture user: ${reg.status} ${await reg.text()}`);
    token = (await reg.json()).access_token;
  }
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (!orgs.some((o) => o.org.slug === LONG.slug)) {
    const r = await fetch(`${API}/api/v1/orgs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: LONG.org, slug: LONG.slug }) });
    if (!r.ok && r.status !== 409) throw new Error(`could not create the long text fixture org: ${r.status}`);
  }
}

// Label fixture for the Settings, Labels tab (I-02): created through the public API as the Lumen Org Admin and removed
// again at the end, so the baseline seed is left as it was. 40 characters is the longest allowed name (rule 4).
const LABEL_NAMES = ['Regression', 'Payments', 'Intermittent freight reconciliation fail'];
async function labelAdmin() {
  const login = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'amara@lumenfreight.test', password: PW }) });
  if (!login.ok) throw new Error(`could not sign in the Lumen admin for the label fixture: ${login.status}`);
  const token = (await login.json()).access_token;
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const orgs = await (await fetch(`${API}/api/v1/orgs`, { headers: h })).json();
  const orgId = orgs.find((o) => o.org.slug === 'lumen').org.id;
  return { h, base: `${API}/api/v1/orgs/${orgId}/labels` };
}
async function ensureLabelFixture() {
  const { h, base } = await labelAdmin();
  for (const name of LABEL_NAMES) {
    const r = await fetch(base, { method: 'POST', headers: h, body: JSON.stringify({ name }) });
    if (!r.ok && r.status !== 409) throw new Error(`could not create the label fixture ${name}: ${r.status}`);
  }
}
async function removeLabelFixture() {
  const { h, base } = await labelAdmin();
  const all = await (await fetch(base, { headers: h })).json();
  for (const l of all.filter((x) => LABEL_NAMES.includes(x.name))) await fetch(`${base}/${l.id}`, { method: 'DELETE', headers: h });
}

// Invitation fixture for the Members screen (I-10): the layout check creates one invitation through the dialog and revokes it
// again through the API at the end. The invite link itself is never read, printed or stored by this script.
const INVITE_EMAIL = 'layout-i10@qapilot.test';
async function removeInviteFixture() {
  const { h } = await labelAdmin();
  const base = (await labelAdmin()).base.replace(/\/labels$/, '');
  const pending = await (await fetch(`${base}/invitations?status=pending`, { headers: h })).json();
  for (const i of pending.filter((x) => x.email === INVITE_EMAIL)) await fetch(`${base}/invitations/${i.id}`, { method: 'DELETE', headers: h });
}

// Runs inside the page. Returns a list of problems.
const audit = ({ checkTargets, popupSelector, margin }) => {
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
  const out = [];
  const visible = (e) => {
    if (e.closest('.sr-only, .skip, nextjs-portal')) return false;
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const fits = (e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= W + 1; };
  const contained = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && fits(p)) return true;
    }
    return false;
  };
  const name = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 28)}"`;

  const over = document.documentElement.scrollWidth - W;
  if (over > 0) out.push(`page scrolls sideways by ${over}px`);
  const all = [...document.querySelectorAll('body *')].filter(visible);
  for (const e of all) {
    if (fits(e) || contained(e)) continue;
    const parent = e.parentElement;
    if (parent && parent !== document.body && !fits(parent) && !contained(parent)) continue;
    const r = e.getBoundingClientRect();
    out.push(`outside the screen: ${name(e)} spans ${Math.round(r.left)} to ${Math.round(r.right)} of ${W}`);
  }
  for (const e of all) {
    const s = getComputedStyle(e);
    if (!e.innerText || !e.innerText.trim()) continue;
    if (s.textOverflow === 'ellipsis') continue; // deliberate truncation (rule 4)
    if (!['hidden', 'clip'].includes(s.overflowX) && !['hidden', 'clip'].includes(s.overflowY)) continue;
    if (e.closest('.sk, .progress, .track')) continue;
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`text clipped: ${name(e)}`);
  }
  for (const e of all) {
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(getComputedStyle(e).fontSize) < 12) out.push(`text smaller than 12px: ${name(e)}`);
  }
  if (checkTargets) {
    const inSentence = (a) => a.tagName === 'A' && getComputedStyle(a).display === 'inline' && a.closest('p, li, .hint, .sub, .banner, .err');
    for (const e of document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="tab"], [role="menuitem"]')) {
      if (!visible(e) || e.type === 'hidden' || inSentence(e) || e.closest('nextjs-portal')) continue;
      const r = e.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.push(`tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${name(e)}`);
    }
  }
  if (popupSelector) {
    const pops = [...document.querySelectorAll(popupSelector)].filter(visible);
    if (!pops.length) out.push(`popup ${popupSelector} did not open`);
    for (const p of pops) {
      const r = p.getBoundingClientRect();
      if (r.left < margin || r.top < margin - 1 || r.right > W - margin || r.bottom > H - margin) {
        out.push(`popup cut off or touching the edge: ${name(p)} at ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${W}x${H}`);
      }
    }
  }
  return out;
};

// Fill a field and confirm the value stuck. Typed text that disappears (for example a page that mounts twice
// after a navigation) is a real bug, so every retry is recorded as a problem; the retry only lets the run go on.
const fillRetries = [];
async function fillStable(page, selector, value) {
  for (let i = 0; i < 3; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(200);
    if (await page.inputValue(selector) === value) return;
    fillRetries.push(`typed text in ${selector} was wiped at step "${step}" (attempt ${i + 1}); the form was replaced after it was filled`);
  }
  throw new Error(`could not keep a value in ${selector}`);
}

let step = 'start';
const problems = new Map();
const note = (vp, where, list) => list.forEach((p) => {
  const key = `${where}: ${p}`;
  if (!problems.has(key)) problems.set(key, []);
  problems.get(key).push(vp.label);
});

// next dev compiles a route on first visit and may abort or reload that navigation once; retry it
async function go(page, path) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(`${BASE}${path}`); await page.waitForLoadState('networkidle'); return; }
    catch (e) { if (i === 2) throw e; await page.waitForTimeout(1500); }
  }
}

await ensureLongFixture();
await ensureLabelFixture();
const browser = await chromium.launch();
{ // warm up every route once so first compiles do not disturb the checks
  const warm = await browser.newPage();
  for (const path of ['/login', '/register', '/invite/not-a-real-token-000', '/onboarding/org', '/o/lumen/dashboard',
    '/o/lumen/projects', '/o/lumen/members', '/o/lumen/settings', '/o/lumen/bugs/new', '/o/lumen/this-page-does-not-exist']) {
    await go(warm, path).catch(() => {});
  }
  await warm.close();
}
let screens = 0;
for (const vp of VIEWPORTS.filter((v) => !ONLY || v.label === ONLY)) {
  const touch = vp.width <= TOUCH_MAX;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  if (process.env.QA_LAYOUT_INJECT_WIPE === '1') {
    // Negative test hook only: wipe the sign in email once after it is typed, like a page that mounts twice
    await page.addInitScript(() => {
      document.addEventListener('input', (e) => {
        const t = e.target;
        if (t && t.id === 'l-email' && !window.__qaWiped) { window.__qaWiped = true; setTimeout(() => { t.value = ''; }, 50); }
      }, true);
    });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (TRACE) page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`  [${vp.label}] navigated ${f.url()}`); });
  const check = async (where, opts = {}) => {
    await page.evaluate(() => document.fonts.ready);
    if (opts.popup === '.menu') {
      // Radix places the menu a frame after it mounts; measure once it has left its initial position
      await page.waitForFunction(() => { const m = document.querySelector('.menu'); return !!m && m.getBoundingClientRect().top > 0; },
        null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(150);
    }
    const margin = opts.margin ?? POPUP_MARGIN;
    note(vp, where, await page.evaluate(audit, { checkTargets: touch, popupSelector: opts.popup ?? null, margin }));
    screens++;
    if (SHOTS && opts.shot) await page.screenshot({ path: resolve(SHOTS, `${opts.shot}-${vp.label}.png`) });
  };

  try {
  // Signed out screens
  for (const [path, shot] of [['/login', 'login'], ['/register', null], ['/invite/not-a-real-token-000', null]]) {
    await go(page, path);
    await page.waitForSelector('.auth-card h2');
    await check(path, { shot });
  }

  // Sign in as the Org Admin (most navigation and controls)
  await go(page, '/login');
  await page.waitForSelector('#l-email');
  step = 'sign in as the Org Admin';
  await fillStable(page, '#l-email', 'amara@lumenfreight.test');
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
  await page.waitForSelector('h1');
  await check('/o/lumen/dashboard', { shot: 'dashboard' });

  // Every popup: org switcher, user menu, mobile navigation drawer
  step = 'open the workspace menu';
  await page.click('.org-switch');
  await check('org switcher menu', { popup: '.menu', shot: 'org-menu' });
  await page.keyboard.press('Escape');
  step = 'open the user menu';
  await page.click('.user-btn');
  await check('user menu', { popup: '.menu', shot: 'user-menu' });
  await page.keyboard.press('Escape');
  if (await page.isVisible('.menu-toggle')) {
    step = 'open the navigation drawer';
    await page.click('.menu-toggle');
    await page.waitForTimeout(300);
    // the drawer is meant to sit flush with the left edge: it must be inside the screen, no margin needed
    await check('navigation drawer', { popup: '.sidebar', shot: 'nav-drawer', margin: 0 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  for (const path of ['/o/lumen/projects', '/o/lumen/members', '/o/lumen/bugs/new', '/o/lumen/this-page-does-not-exist', '/onboarding/org']) {
    step = `open ${path}`;
    await go(page, path);
    await page.waitForSelector('h1, h2');
    await check(path);
  }

  // Settings, Labels tab (I-02): default table with a 40 character name, the New label dialog and its error state
  step = 'open settings';
  await go(page, '/o/lumen/settings');
  await page.waitForSelector('table.t .label-chip');
  await check('/o/lumen/settings (labels)', { shot: 'settings-labels' });
  step = 'open the New label dialog';
  await page.click('button:has-text("New label")');
  await page.waitForSelector('.modal');
  await check('new label dialog', { popup: '.modal', shot: 'label-dialog' });
  step = 'submit a name that already exists';
  await page.fill('#label-name', ' regression ');
  await page.click('.modal button:has-text("Add label")');
  await page.waitForSelector('.modal .err');
  await check('new label dialog with a duplicate name error', { popup: '.modal', shot: 'label-dialog-error' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });

  // Members and roles (I-10): table, invite dialog (form, then link), remove confirmation, no results, pending invitations
  step = 'open members';
  await go(page, '/o/lumen/members');
  await page.waitForSelector('table.t tbody tr');
  await page.waitForSelector('text=Pending invitations');
  await check('/o/lumen/members (admin)', { shot: 'members' });
  step = 'open the Invite people dialog';
  await page.click('button:has-text("Invite people")');
  await page.waitForSelector('.modal');
  await check('invite dialog', { popup: '.modal', shot: 'members-invite-form' });
  step = 'create an invitation';
  await page.fill('#inv-email', INVITE_EMAIL);
  await page.click('.modal button:has-text("Create invite link")');
  await page.waitForSelector('#inv-link');
  // Mask the secret link in screenshots (the audit measures the same box; dots are as wide as characters in this field)
  await page.addStyleTag({ content: '#inv-link { -webkit-text-security: disc; }' });
  await check('invite dialog with the link', { popup: '.modal', shot: 'members-invite-link' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  step = 'open the remove confirmation';
  await page.click('table.t tbody button:has-text("Remove")');
  await page.waitForSelector('.modal');
  await check('remove member confirmation', { popup: '.modal', shot: 'members-remove' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  step = 'search with no results';
  await page.fill('#m-q', 'zzzz-no-such-person');
  await page.waitForSelector('text=No one matches your search or role filter.');
  await check('members: no results', { shot: 'members-no-results' });
  await page.fill('#m-q', '');

  // The QA Lead reads the same screen without any controls (REQ-006, PERSONAS_AND_ROLES.md section 3.1)
  step = 'sign out to sign in as the QA Lead';
  await page.click('.user-btn');
  await page.click('.menu >> text=Sign out');
  await page.waitForURL((u) => u.pathname === '/login');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', 'lukas@lumenfreight.test');
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
  step = 'open members as the QA Lead';
  await go(page, '/o/lumen/members');
  await page.waitForSelector('table.t tbody tr');
  await page.waitForSelector('text=Pending invitations');
  if (await page.locator('table.t select, button:has-text("Invite people"), button:has-text("Remove"), button:has-text("Revoke")').count()) {
    note(vp, 'members (QA Lead)', ['the QA Lead sees a control that only an Org Admin may use']);
  }
  await check('/o/lumen/members (QA Lead, read only)', { shot: 'members-lead' });

  // Long names and emails (rule 4)
  step = 'back to the dashboard to sign out';
  await go(page, '/o/lumen/dashboard');
  await page.waitForSelector('.user-btn');
  await page.click('.user-btn');
  step = 'sign out';
  await page.click('.menu >> text=Sign out');
  await page.waitForURL((u) => u.pathname === '/login');
  await page.waitForLoadState('networkidle'); // fill only after the sign in page has hydrated
  step = 'sign in as the long names fixture';
  await fillStable(page, '#l-email', LONG.email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL(`**/o/${LONG.slug}/dashboard`);
  await page.waitForSelector('h1');
  await check('long names: dashboard', { shot: 'long-names' });
  await page.click('.org-switch');
  await check('long names: org switcher menu', { popup: '.menu' });
  await page.keyboard.press('Escape');
  await page.click('.user-btn');
  await check('long names: user menu', { popup: '.menu', shot: 'long-names-user-menu' });
  await page.keyboard.press('Escape');
  // A workspace with no labels shows the empty state (the long names fixture org has none)
  step = 'open settings in the long names workspace';
  await go(page, `/o/${LONG.slug}/settings`);
  await page.waitForSelector('.state-box');
  await check('long names: settings (labels empty state)', { shot: 'settings-labels-empty' });
  step = 'open members in the long names workspace';
  await go(page, `/o/${LONG.slug}/members`);
  await page.waitForSelector('table.t tbody tr');
  await check('long names: members', { shot: 'members-long-names' });

  } catch (e) {
    // A step that cannot run is itself a failure: record it and carry on with the next width
    note(vp, 'flow', [`could not finish the checks at step "${step}": ${String(e.message || e).split(/\r?\n/)[0]}`]);
    if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `flow-error-${vp.label}.png`) }).catch(() => {});
  }
  if (fillRetries.length) note(vp, 'form', fillRetries.splice(0));
  if (errors.length) note(vp, 'page errors', errors);
  await ctx.close();
}
await browser.close();
await removeLabelFixture().catch((e) => console.log(`note: could not remove the label fixture: ${e.message}`));
await removeInviteFixture().catch((e) => console.log(`note: could not revoke the invitation fixture: ${e.message}`));

console.log(`Checked ${screens} screen and popup states at ${VIEWPORTS.filter((v) => !ONLY || v.label === ONLY).map((v) => v.label).join(', ')}`);
if (problems.size) {
  console.log(`FAIL: ${problems.size} problem(s)`);
  for (const [k, labels] of problems) console.log(`  - [${labels.join(', ')}] ${k}`);
  process.exit(1);
}
console.log('PASS: nothing outside the screen, no popup cut off, no clipped or tiny text, 44 px targets on touch widths');
