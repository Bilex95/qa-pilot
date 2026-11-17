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

// Fill a field and confirm the value stuck: a remount right after navigation can wipe it
async function fillStable(page, selector, value) {
  for (let i = 0; i < 3; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(200);
    if (await page.inputValue(selector) === value) return;
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
const browser = await chromium.launch();
{ // warm up every route once so first compiles do not disturb the checks
  const warm = await browser.newPage();
  for (const path of ['/login', '/register', '/invite/not-a-real-token-000', '/onboarding/org', '/o/lumen/dashboard',
    '/o/lumen/projects', '/o/lumen/members', '/o/lumen/bugs/new', '/o/lumen/this-page-does-not-exist']) {
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

  } catch (e) {
    // A step that cannot run is itself a failure: record it and carry on with the next width
    note(vp, 'flow', [`could not finish the checks at step "${step}": ${String(e.message || e).split(/\r?\n/)[0]}`]);
    if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `flow-error-${vp.label}.png`) }).catch(() => {});
  }
  if (errors.length) note(vp, 'page errors', errors);
  await ctx.close();
}
await browser.close();

console.log(`Checked ${screens} screen and popup states at ${VIEWPORTS.filter((v) => !ONLY || v.label === ONLY).map((v) => v.label).join(', ')}`);
if (problems.size) {
  console.log(`FAIL: ${problems.size} problem(s)`);
  for (const [k, labels] of problems) console.log(`  - [${labels.join(', ')}] ${k}`);
  process.exit(1);
}
console.log('PASS: nothing outside the screen, no popup cut off, no clipped or tiny text, 44 px targets on touch widths');
