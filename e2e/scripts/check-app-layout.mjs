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

// Bug fixtures for the bug list and the New bug form (I-03), created through the public API as the Lumen Org Admin and removed at
// the end: a project with a 59 character component, five bugs (one with a 200 character title, one with a 158 character unbroken
// word, one carrying 8 labels), and a saved view with a 59 character name. Bugs are soft deleted, so the rows stay and the keys are
// used up; the project is archived again so it does not show up in the project pickers afterwards.
const BUG_PROJECT = { key: 'LAYT', name: 'Layout fixture project' };
const FIXTURE_LABELS = ['Layout label one', 'Layout label two', 'Layout label three', 'Layout label four', 'Layout label five'];
const LONG_COMPONENT = 'Reconciliation '.repeat(4).trim();
const LONG_TITLE = 'Shipment manifest export fails for carrier references with non Latin characters on routes with many stops. '.repeat(3).slice(0, 200).trim();
const UNBROKEN_TITLE = `Unbroken${'x'.repeat(150)}`;
const LONG_VIEW = 'Critical checkout regressions across all supported releases';
const VIEW_NAME = 'Layout view check';
async function bugApi() {
  const { h, base } = await labelAdmin();
  return { h, org: base.replace(/\/labels$/, '') };
}
async function must(res, what) {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}
async function clearBugFixture() {
  const { h, org } = await bugApi();
  const projects = await must(await fetch(`${org}/projects?include_archived=true&page_size=100`, { headers: h }), 'list projects');
  const project = projects.items.find((p) => p.key === BUG_PROJECT.key);
  if (project) {
    const bugs = await must(await fetch(`${org}/bugs?project_id=${project.id}&page_size=100`, { headers: h }), 'list fixture bugs');
    for (const b of bugs.items) await fetch(`${org}/bugs/${b.id}`, { method: 'DELETE', headers: h });
  }
  if (project) { // test suites of the fixture project (their cases are soft deleted with them)
    const found = await must(await fetch(`${org}/test-suites?project_id=${project.id}&page_size=100`, { headers: h }), 'list fixture suites');
    for (const s of found.items) await fetch(`${org}/test-suites/${s.id}`, { method: 'DELETE', headers: h });
  }
  const views = await must(await fetch(`${org}/saved-views`, { headers: h }), 'list saved views');
  for (const v of views.filter((x) => [LONG_VIEW, VIEW_NAME].includes(x.name))) await fetch(`${org}/saved-views/${v.id}`, { method: 'DELETE', headers: h });
  const labels = await must(await fetch(`${org}/labels`, { headers: h }), 'list labels');
  for (const l of labels.filter((x) => FIXTURE_LABELS.includes(x.name))) await fetch(`${org}/labels/${l.id}`, { method: 'DELETE', headers: h });
  return { h, org, project };
}
async function ensureBugFixture() {
  let { h, org, project } = await clearBugFixture();
  const json = (body) => ({ method: 'POST', headers: h, body: JSON.stringify(body) });
  if (!project) project = await must(await fetch(`${org}/projects`, json({ name: BUG_PROJECT.name, key: BUG_PROJECT.key })), 'create the fixture project');
  else if (project.archived_at) await must(await fetch(`${org}/projects/${project.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ archived: false }) }), 'unarchive the fixture project');
  const comps = await must(await fetch(`${org}/projects/${project.id}/components`, { headers: h }), 'list components');
  const component = comps.find((c) => c.name === LONG_COMPONENT) ?? await must(await fetch(`${org}/projects/${project.id}/components`, json({ name: LONG_COMPONENT })), 'create the long component');
  const envs = await must(await fetch(`${org}/projects/${project.id}/environments`, { headers: h }), 'list environments');
  const prod = envs.find((e) => e.name === 'prod') ?? envs[0];
  for (const name of FIXTURE_LABELS) await must(await fetch(`${org}/labels`, json({ name })), `create label ${name}`);
  const labels = await must(await fetch(`${org}/labels`, { headers: h }), 'list labels');
  const idOf = (n) => labels.find((l) => l.name === n).id;
  const eight = [...LABEL_NAMES, ...FIXTURE_LABELS].map(idOf);
  const members = await must(await fetch(`${org}/members?page_size=100`, { headers: h }), 'list members');
  const diego = members.items.find((m) => m.user.email === 'diego@lumenfreight.test').user.id;
  const bug = async (b) => must(await fetch(`${org}/bugs`, json({ project_id: project.id, ...b })), `create bug ${b.title.slice(0, 20)}`);
  await bug({ title: 'Checkout total ignores the discount code', severity: 'high', priority: 'p2', component_id: component.id,
    environment_id: prod.id, assignee_id: diego, label_ids: [idOf('Regression'), idOf('Payments')] });
  await bug({ title: LONG_TITLE, severity: 'critical', priority: 'p1', component_id: component.id, environment_id: prod.id,
    assignee_id: diego, label_ids: eight });
  await bug({ title: UNBROKEN_TITLE, severity: 'medium', priority: 'p3', environment_id: prod.id });
  await bug({ title: 'Tooltip is cut off on the shipment map', severity: 'low', priority: 'p4' });
  await bug({ title: 'Driver app crashes when the network drops during upload', severity: 'high', priority: 'p2', assignee_id: diego });
  await must(await fetch(`${org}/saved-views`, json({ name: LONG_VIEW, filters: { version: 1, severity: ['critical'], open: true } })), 'create the long view');
}
// Test suite fixtures for the suites screen and the case editor (I-06): a suite with 30 cases (so the pager shows), one case with
// a 200 character title, 50 steps of long text and 20 tags, a suite with an 80 character name and a 1000 character description,
// and an empty suite. Created in the fixture project and removed with it (clearBugFixture).
const SUITE_A = 'Layout fixture suite';
const SUITE_B = 'Intermittent carrier reconciliation and settlement ledger export checks for long running batches';
const SUITE_B_NAME = SUITE_B.slice(0, 80).trim();
const SUITE_C = 'Layout empty suite';
const TEST_FIX = { caseKey: '' };
async function ensureTestFixture() {
  const { h, org } = await bugApi();
  const projects = await must(await fetch(`${org}/projects?include_archived=true&page_size=100`, { headers: h }), 'list projects');
  const project = projects.items.find((p) => p.key === BUG_PROJECT.key); // ensureBugFixture has created it
  const json = (body) => ({ method: 'POST', headers: h, body: JSON.stringify(body) });
  const comps = await must(await fetch(`${org}/projects/${project.id}/components`, { headers: h }), 'list components');
  const component = comps.find((c) => c.name === LONG_COMPONENT);
  const suite = async (body) => must(await fetch(`${org}/test-suites`, json({ project_id: project.id, ...body })), 'create suite');
  const a = await suite({ name: SUITE_A, description: 'Cart, discounts and payment. '.repeat(10).trim(), component_id: component?.id });
  await suite({ name: SUITE_B_NAME, description: 'Long description of what this suite covers. '.repeat(22).slice(0, 1000).trim() });
  await suite({ name: SUITE_C });
  const step = (i, long) => ({ action: long ? `Step ${i} ${'unbrokenaction'.repeat(8)} with text that goes on and on to fill the box` : `Action ${i}`,
    expected: long ? `Expected ${i} ${'unbrokenexpectation'.repeat(6)} and a longer sentence of text` : `Expected ${i}` });
  const long = await must(await fetch(`${org}/test-suites/${a.id}/cases`, json({
    title: LONG_TITLE, preconditions: 'A shipper with parcels in the cart. '.repeat(10).trim(), case_type: 'edge', priority: 'p1',
    steps: Array.from({ length: 50 }, (_, i) => step(i + 1, i % 5 === 0)),
    tags: ['t'.repeat(30), ...Array.from({ length: 19 }, (_, i) => `tag-${i + 1}`)] })), 'create the long case');
  TEST_FIX.caseKey = long.key;
  await must(await fetch(`${org}/test-suites/${a.id}/cases/bulk`, json({ cases: Array.from({ length: 29 }, (_, i) => ({
    title: `Layout fixture case number ${i + 1}`, steps: [step(1, false), step(2, false)], tags: ['discounts', 'layout'], case_type: ['positive', 'negative', 'edge'][i % 3],
    priority: ['p1', 'p2', 'p3', 'p4'][i % 4] })) })), 'create the bulk cases');
}
async function removeBugFixture() {
  const { h, org, project } = await clearBugFixture();
  if (project) await fetch(`${org}/projects/${project.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ archived: true }) });
}

// Sign out through the user menu and sign in again as another Lumen person
async function signInAs(page, email) {
  step = `sign out to sign in as ${email}`;
  await page.click('.user-btn');
  await page.click('.menu >> text=Sign out');
  await page.waitForURL((u) => u.pathname === '/login');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
}

// Runs inside the page. Returns a list of problems.
const audit =({ checkTargets, popupSelector, margin }) => {
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
await ensureBugFixture();
await ensureTestFixture();
const browser = await chromium.launch();
{ // warm up every route once so first compiles do not disturb the checks
  const warm = await browser.newPage();
  for (const path of ['/login', '/register', '/invite/not-a-real-token-000', '/onboarding/org', '/o/lumen/dashboard',
    '/o/lumen/projects', '/o/lumen/members', '/o/lumen/settings', '/o/lumen/bugs', '/o/lumen/bugs/new', '/o/lumen/bugs/WEB-1',
    '/o/lumen/tests', '/o/lumen/tests/cases/new', `/o/lumen/tests/cases/${TEST_FIX.caseKey}`,
    '/o/lumen/this-page-does-not-exist']) {
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

  for (const path of ['/o/lumen/projects', '/o/lumen/members', '/o/lumen/bugs/WEB-1', '/o/lumen/this-page-does-not-exist', '/onboarding/org']) {
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
  // The delete confirmation names how many bugs lose the label (the count is real since I-03): Regression is on one fixture bug
  step = 'open the delete label confirmation';
  await page.click('button[aria-label="Delete label Regression"]');
  await page.waitForSelector('.modal');
  await page.waitForSelector('#delete-label-count');
  await check('delete label confirmation', { popup: '.modal', shot: 'label-delete-confirm' });
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

  // Bug list (I-03): the default list with the long text fixtures, More filters, saved views, and every state
  const bugsUrl = /\/api\/v1\/orgs\/[^/]+\/bugs\?/;
  const cors = { 'access-control-allow-origin': BASE, 'access-control-allow-credentials': 'true', 'access-control-expose-headers': 'X-Request-ID' };
  step = 'open the bug list';
  await go(page, '/o/lumen/bugs');
  await page.waitForSelector('table.t tbody tr');
  await check('/o/lumen/bugs (admin, long title, 8 labels, long component)', { shot: 'bugs' });
  step = 'open More filters and pick the fixture project and its long component';
  await page.click('button:has-text("More filters")');
  await page.selectOption('#f-p', { label: BUG_PROJECT.name });
  await page.waitForFunction((n) => [...document.querySelectorAll('#f-c option')].some((o) => o.textContent === n), LONG_COMPONENT);
  await page.selectOption('#f-c', { label: LONG_COMPONENT });
  await page.waitForSelector('table.t tbody tr');
  await check('bug list: More filters open, project and a long component chosen', { shot: 'bugs-more-filters' });
  step = 'clear the filters';
  await page.click('button:has-text("Clear filters")');
  await page.waitForSelector('table.t tbody tr');

  // Saved views: the long named view tab, the Save view dialog (form, then the name already taken), and the delete confirmation
  step = 'open the Save view dialog';
  await page.click('.views button:has-text("Save view")');
  await page.waitForSelector('.modal');
  await check('save view dialog', { popup: '.modal', shot: 'bugs-save-view' });
  await fillStable(page, '#view-name', VIEW_NAME);
  await page.click('.modal button:has-text("Save view")');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.waitForSelector(`.views button[aria-label="Delete view ${VIEW_NAME}"]`);
  step = 'save a view with a name that is taken';
  await page.click('.views button:has-text("Save view")');
  await page.waitForSelector('.modal');
  await fillStable(page, '#view-name', VIEW_NAME.toUpperCase());
  await page.click('.modal button:has-text("Save view")');
  await page.waitForSelector('.modal .err');
  await check('save view dialog with a name already taken', { popup: '.modal', shot: 'bugs-save-view-error' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  step = 'apply the long named view';
  await page.click(`.views button[title="${LONG_VIEW}"]`);
  await page.waitForSelector('table.t tbody tr');
  await check('bug list: the long named saved view applied', { shot: 'bugs-view-applied' });
  step = 'open the delete view confirmation';
  await page.click(`.views button[aria-label="Delete view ${VIEW_NAME}"]`);
  await page.waitForSelector('.modal');
  await check('delete view confirmation', { popup: '.modal', shot: 'bugs-delete-view' });
  await page.click('.modal button:has-text("Delete view")');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.waitForSelector(`.views button[aria-label="Delete view ${VIEW_NAME}"]`, { state: 'detached' });

  step = 'search with no results';
  await go(page, '/o/lumen/bugs');
  await page.waitForSelector('table.t tbody tr');
  await fillStable(page, '#f-q', 'zzzz-no-such-bug');
  await page.waitForSelector('text=No bugs match these filters');
  await check('bug list: no results', { shot: 'bugs-no-results' });

  step = 'show the Past SLA badge';
  await page.route(bugsUrl, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.items.slice(0, 2).forEach((b) => { b.sla_breached = true; }); // the API cannot backdate a bug, so the badge is shown by editing the response
    await route.fulfill({ response: res, json: body });
  });
  await go(page, '/o/lumen/bugs');
  await page.waitForSelector('.badge.sla');
  await check('bug list: Past SLA badge', { shot: 'bugs-sla' });
  await page.unroute(bugsUrl);

  step = 'show the loading state';
  await page.route(bugsUrl, async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
  await page.goto(`${BASE}/o/lumen/bugs`, { waitUntil: 'commit' });
  await page.waitForSelector('h1:has-text("Bugs")');
  await page.waitForSelector('.sk');
  await check('bug list: loading', { shot: 'bugs-loading' });
  await page.waitForSelector('table.t tbody tr');
  await page.unroute(bugsUrl);

  step = 'show the error state';
  await page.route(bugsUrl, (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'authorization,content-type,x-request-id', 'access-control-allow-methods': 'GET,OPTIONS' } })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'x-request-id': 'req-layout-i03' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong on our side.', details: {} } }) }));
  await go(page, '/o/lumen/bugs');
  await page.waitForSelector('.state-box.error');
  await check('bug list: error', { shot: 'bugs-error' });
  await page.unroute(bugsUrl);

  // New bug (SCR-11): default, the error banner, and long text in every field
  step = 'open the New bug form';
  await go(page, '/o/lumen/bugs/new');
  await page.waitForSelector('#n-title');
  await check('/o/lumen/bugs/new (admin)', { shot: 'bug-new' });
  step = 'save an empty bug form';
  await page.click('button:has-text("Save bug")');
  await page.waitForSelector('.banner.error');
  await check('new bug: error banner', { shot: 'bug-new-error' });
  step = 'fill the New bug form with long text';
  await page.selectOption('#n-proj', { label: BUG_PROJECT.name });
  await page.waitForFunction((n) => [...document.querySelectorAll('#n-comp option')].some((o) => o.textContent === n), LONG_COMPONENT);
  await page.selectOption('#n-comp', { label: LONG_COMPONENT });
  await fillStable(page, '#n-title', LONG_TITLE);
  await page.fill('#n-step-1', UNBROKEN_TITLE);
  await page.click('button:has-text("Add step")');
  await page.fill('#n-step-2', LONG_TITLE);
  await page.fill('#n-exp', UNBROKEN_TITLE);
  await page.fill('#n-act', LONG_TITLE.repeat(4));
  for (const b of await page.locator('#n-lab button').all()) await b.click();
  await check('new bug: long text, every label chosen', { shot: 'bug-new-long' });

  // Test suites (SCR-12) and the case editor (SCR-13), I-06: default with the long fixtures, the pager, dialogs, every state
  const suitesUrl = /\/api\/v1\/orgs\/[^/]+\/test-suites\?/;
  const caseUrl = /\/api\/v1\/orgs\/[^/]+\/test-cases\//;
  step = 'open the test suites';
  await go(page, '/o/lumen/tests');
  await page.waitForSelector('.suite-list a');
  await page.click(`.suite-list a:has-text("${SUITE_A}")`);
  await page.waitForSelector('table.t tbody tr');
  await page.waitForSelector('.pager');
  await check('/o/lumen/tests (admin, 30 cases, a long case)', { shot: 'tests' });
  step = 'open the New suite dialog and a name that is taken';
  await page.click('button:has-text("New suite")');
  await page.waitForSelector('.modal');
  await check('new suite dialog', { popup: '.modal', shot: 'tests-new-suite' });
  await fillStable(page, '#suite-name', SUITE_A.toUpperCase());
  await page.selectOption('#suite-project', { label: BUG_PROJECT.name });
  await page.click('.modal button:has-text("Create suite")');
  await page.waitForSelector('.modal .err');
  await check('new suite dialog with a name already taken', { popup: '.modal', shot: 'tests-new-suite-error' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  step = 'open the Edit suite dialog';
  await page.click('button:has-text("Edit suite")');
  await page.waitForSelector('.modal');
  await check('edit suite dialog', { popup: '.modal', shot: 'tests-edit-suite' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  step = 'open the delete suite confirmation';
  await page.click('button[aria-label^="Delete suite"]');
  await page.waitForSelector('#delete-suite-count');
  await check('delete suite confirmation', { popup: '.modal', shot: 'tests-delete-suite' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  step = 'open the suite with the long name and the empty suite';
  await page.click(`.suite-list a:has-text("${SUITE_B_NAME.slice(0, 30)}")`);
  await page.waitForSelector('text=No cases in this suite yet');
  await check('tests: suite with an 80 character name and a long description, no cases', { shot: 'tests-long-suite' });
  await page.click(`.suite-list a:has-text("${SUITE_C}")`);
  await page.waitForSelector('text=No cases in this suite yet');
  await check('tests: empty suite', { shot: 'tests-empty-suite' });

  step = 'show the suites no results, loading and error states';
  await page.route(suitesUrl, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { items: [], page: 1, page_size: 100, total: 0 } });
  });
  await go(page, '/o/lumen/tests');
  await page.waitForSelector('text=No test suites yet');
  await check('tests: no suites at all', { shot: 'tests-empty' });
  await page.unroute(suitesUrl);
  await page.route(suitesUrl, async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
  await page.goto(`${BASE}/o/lumen/tests`, { waitUntil: 'commit' });
  await page.waitForSelector('h1:has-text("Test suites")');
  await page.waitForSelector('.sk');
  await check('tests: loading', { shot: 'tests-loading' });
  await page.waitForSelector('.suite-list a');
  await page.unroute(suitesUrl);
  await page.route(suitesUrl, (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'authorization,content-type,x-request-id', 'access-control-allow-methods': 'GET,OPTIONS' } })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'x-request-id': 'req-layout-i06' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong on our side.', details: {} } }) }));
  await go(page, '/o/lumen/tests');
  await page.waitForSelector('.state-box.error');
  await check('tests: error', { shot: 'tests-error' });
  await page.unroute(suitesUrl);

  step = 'open the case editor with the long case';
  await go(page, `/o/lumen/tests/cases/${TEST_FIX.caseKey}`);
  await page.waitForSelector('#c-title');
  await page.waitForSelector('textarea[aria-label="Step 50 action"]');
  await check('case editor (admin, 200 character title, 50 steps, 20 tags)', { shot: 'case-editor' });
  step = 'open the delete case confirmation';
  await page.click('button[aria-label^="Delete case"]');
  await page.waitForSelector('.modal');
  await check('delete case confirmation', { popup: '.modal', shot: 'case-delete' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  step = 'show the case editor loading, error and not found states';
  await page.route(caseUrl, async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
  await page.goto(`${BASE}/o/lumen/tests/cases/${TEST_FIX.caseKey}`, { waitUntil: 'commit' });
  await page.waitForSelector('h1:has-text("Test case")');
  await page.waitForSelector('[role=status] .sk');
  await check('case editor: loading', { shot: 'case-loading' });
  await page.waitForSelector('#c-title');
  await page.unroute(caseUrl);
  await page.route(caseUrl, (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'authorization,content-type,x-request-id', 'access-control-allow-methods': 'GET,OPTIONS' } })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'x-request-id': 'req-layout-i06' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong on our side.', details: {} } }) }));
  await go(page, `/o/lumen/tests/cases/${TEST_FIX.caseKey}`);
  await page.waitForSelector('.state-box.error');
  await check('case editor: error', { shot: 'case-error' });
  await page.unroute(caseUrl);
  await go(page, '/o/lumen/tests/cases/TC-999999');
  await page.waitForSelector('text=This test case does not exist');
  await check('case editor: not found', { shot: 'case-not-found' });
  step = 'open the New test case form and save it empty';
  await go(page, '/o/lumen/tests/cases/new');
  await page.waitForSelector('#c-title');
  await check('/o/lumen/tests/cases/new (admin)', { shot: 'case-new' });
  await page.click('button:has-text("Save case")');
  await page.waitForSelector('.banner.error');
  await check('new case: error banner', { shot: 'case-new-error' });

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

  // The Developer: severity and priority are disabled on the New bug form (D-032); the Viewer cannot report bugs
  await signInAs(page, 'diego@lumenfreight.test');
  step = 'open the bug list as the Developer';
  await go(page, '/o/lumen/bugs');
  await page.waitForSelector('table.t tbody tr');
  await check('/o/lumen/bugs (Developer)', { shot: 'bugs-developer' });
  step = 'open the New bug form as the Developer';
  await go(page, '/o/lumen/bugs/new');
  await page.waitForSelector('#n-title');
  if (!(await page.isDisabled('#n-sev')) || !(await page.isDisabled('#n-pri')) || !(await page.isVisible('#dev-note'))) {
    note(vp, 'new bug (Developer)', ['severity and priority must be disabled with the hint for a Developer']);
  }
  await check('/o/lumen/bugs/new (Developer)', { shot: 'bug-new-developer' });
  step = 'open the test suites and a case as the Developer';
  await go(page, '/o/lumen/tests');
  await page.waitForSelector('.suite-list a');
  await page.click(`.suite-list a:has-text("${SUITE_A}")`);
  await page.waitForSelector('table.t tbody tr');
  if (await page.locator('button:has-text("New suite"), button:has-text("Edit suite"), button[aria-label^="Delete suite"], a:has-text("New test case")').count()) {
    note(vp, 'tests (Developer)', ['the Developer sees a control that only QA roles may use']);
  }
  await check('/o/lumen/tests (Developer, read only)', { shot: 'tests-developer' });
  await go(page, `/o/lumen/tests/cases/${TEST_FIX.caseKey}`);
  await page.waitForSelector('textarea[aria-label="Step 1 action"]');
  if (!(await page.isDisabled('#c-title')) || !(await page.isDisabled('textarea[aria-label="Step 1 action"]')) ||
      await page.locator('button:has-text("Save case"), button:has-text("Add step"), button[aria-label^="Delete case"]').count()) {
    note(vp, 'case editor (Developer)', ['the fields must be disabled and there must be no Save, Add step or Delete']);
  }
  await page.waitForSelector('text=Only QA roles can edit test cases.');
  await check('case editor (Developer, read only)', { shot: 'case-editor-developer' });
  await signInAs(page, 'hana@lumenfreight.test');
  step = 'open the bug list as the Viewer';
  await go(page, '/o/lumen/bugs');
  await page.waitForSelector('table.t tbody tr');
  if (await page.locator('a:has-text("Report bug")').count()) note(vp, 'bug list (Viewer)', ['the Viewer sees the Report bug button']);
  await check('/o/lumen/bugs (Viewer)', { shot: 'bugs-viewer' });
  step = 'open the New bug form as the Viewer';
  await go(page, '/o/lumen/bugs/new');
  await page.waitForSelector('text=Viewers cannot report bugs');
  await check('/o/lumen/bugs/new (Viewer, no access)', { shot: 'bug-new-viewer' });

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
  // A workspace with no bugs at all shows the empty state with the Report bug action
  step = 'open the bug list in the long names workspace';
  await go(page, `/o/${LONG.slug}/bugs`);
  await page.waitForSelector('text=No bugs yet');
  await check('long names: bug list (empty state)', { shot: 'bugs-empty' });
  step = 'open the test suites in the long names workspace';
  await go(page, `/o/${LONG.slug}/tests`);
  await page.waitForSelector('text=No test suites yet');
  await check('long names: test suites (empty state)', { shot: 'tests-empty-workspace' });

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
await removeBugFixture().catch((e) => console.log(`note: could not remove the bug fixture: ${e.message}`));
await removeLabelFixture().catch((e) => console.log(`note: could not remove the label fixture: ${e.message}`));
await removeInviteFixture().catch((e) => console.log(`note: could not revoke the invitation fixture: ${e.message}`));

console.log(`Checked ${screens} screen and popup states at ${VIEWPORTS.filter((v) => !ONLY || v.label === ONLY).map((v) => v.label).join(', ')}`);
if (problems.size) {
  console.log(`FAIL: ${problems.size} problem(s)`);
  for (const [k, labels] of problems) console.log(`  - [${labels.join(', ')}] ${k}`);
  process.exit(1);
}
console.log('PASS: nothing outside the screen, no popup cut off, no clipped or tiny text, 44 px targets on touch widths');
