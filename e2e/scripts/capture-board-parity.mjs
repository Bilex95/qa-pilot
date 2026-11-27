// I-04 parity capture: the real Board next to the locked screenshots (design/screenshots/board-*).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 capture-board-parity.mjs
// Writes e2e/parity/stage4/i04/app/*.png and e2e/parity/stage4/i04/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i04" with 14 bugs spread over the nine columns, created through the API and removed in `finally`
// (bugs soft deleted, project archived). Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i04');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const KEY = `Y${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* 204 */ }
  if (!res.ok && method !== 'DELETE') throw new Error(`${method} ${path.split('?')[0]} answered ${res.status}`);
  return json;
};
const login = async (email) => (await api('/auth/login', { method: 'POST', body: { email, password: PW } })).access_token;

async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function open(browser, viewport, email) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/lumen/dashboard');
  return { ctx, page };
}
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(APP, `${name}.png`) }); };

const created = { token: '', org: '', project: null, bugs: [] };
const pairs = [];
const browser = await chromium.launch();
try {
  const admin = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: admin });
  created.org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  const members = (await api(`${created.org}/members?page_size=100`, { token: admin })).items;
  const who = (role, n = 0) => members.filter((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test'))[n]?.user;
  const lead = who('qa_lead'); const devs = [who('developer'), who('qa_engineer'), who('qa_engineer', 1)].filter(Boolean);
  created.token = await login(lead.email);
  created.project = await api(`${created.org}/projects`, { method: 'POST', token: created.token, body: { name: 'parity-i04', key: KEY } });
  // [title, severity, priority, path of moves, assignee index or -1]
  const plan = [
    ['Search results show archived shipments for new customers', 'medium', 'p3', [], -1],
    ['Tracking events arrive out of order for multi leg shipments', 'medium', 'p3', [], -1],
    ['App crashes when the proof of delivery photo exceeds 12 MB', 'critical', 'p1', [], -1],
    ['Password reset link opens a blank page in Safari 17', 'high', 'p2', ['triaged'], -1],
    ['Card payment fails with 3D Secure on the second attempt', 'critical', 'p1', ['triaged'], 0],
    ['Tracking webhook retries forever after receiver returns 410', 'high', 'p2', ['triaged'], 1],
    ['Checkout total ignores discount code after changing delivery address', 'critical', 'p1', ['triaged', 'in_progress'], 0],
    ['Session expires during checkout without a warning', 'high', 'p2', ['triaged', 'in_progress'], 1],
    ['Notification preferences are not saved when toggled quickly', 'medium', 'p3', ['triaged', 'in_progress', 'fixed'], 2],
    ['Token refresh endpoint accepts revoked refresh tokens', 'critical', 'p1', ['triaged', 'in_progress', 'fixed'], 0],
    ['Onboarding skips the licence photo step on Android 14', 'high', 'p2', ['triaged', 'in_progress', 'fixed', 'ready_for_retest'], 1],
    ['Invoice PDF cuts off the last line item', 'low', 'p4', ['triaged', 'in_progress', 'fixed', 'ready_for_retest', 'verified'], 2],
    ['Dark mode flashes white on first load', 'low', 'p4', ['triaged', 'in_progress', 'fixed', 'ready_for_retest', 'verified', 'closed'], -1],
    ['Rate quote rounds up parcels under one kilo', 'medium', 'p3', ['triaged', 'in_progress', 'fixed', 'reopened'], 2],
    ['Legacy export button does nothing in Firefox ESR', 'low', 'p4', ['wont_fix'], -1],
  ];
  for (const [title, severity, priority, moves, who_i] of plan) {
    const bug = await api(`${created.org}/bugs`, { method: 'POST', token: created.token,
      body: { project_id: created.project.id, title, severity, priority, ...(who_i >= 0 ? { assignee_id: devs[who_i].id } : {}) } });
    created.bugs.push(bug);
    for (const to of moves) await api(`${created.org}/bugs/${bug.id}/transitions`, { method: 'POST', token: created.token, body: { to_status: to } });
  }
  const url = `${BASE}/o/lumen/board?project=${created.project.id}`;

  const d = await open(browser, { width: 1440, height: 900 }, lead.email);
  await d.page.goto(url);
  await d.page.waitForSelector('article.card');
  await shot(d.page, 'board-default-desktop'); pairs.push(['board-default-desktop', 'board-default-desktop.png']);
  await d.page.click('article.card button[aria-label^="Move"]');
  await d.page.waitForSelector('.menu');
  await shot(d.page, 'board-move-menu-desktop');
  await d.page.keyboard.press('Escape');

  // Empty: a project with no bugs
  const emptyProject = await api(`${created.org}/projects`, { method: 'POST', token: created.token, body: { name: 'parity-i04 empty', key: `X${KEY.slice(1)}` } });
  created.extra = emptyProject;
  await d.page.goto(`${BASE}/o/lumen/board?project=${emptyProject.id}`);
  await d.page.waitForSelector('text=The board is empty');
  await shot(d.page, 'board-empty-desktop'); pairs.push(['board-empty-desktop', 'board-empty-desktop.png']);

  // Loading: hold the board request open while the screenshot is taken
  const l = await open(browser, { width: 1440, height: 900 }, lead.email);
  await l.page.route('**/api/v1/orgs/*/bugs/board*', () => { /* never answered: the screen stays in its loading state */ });
  await l.page.goto(url);
  await l.page.waitForSelector('h1:has-text("Board")');
  await l.page.waitForSelector('.sk');
  await shot(l.page, 'board-loading-desktop'); pairs.push(['board-loading-desktop', 'board-loading-desktop.png']);
  await l.ctx.close();

  // Error: a real 500 with the CORS headers the API sends
  const e = await open(browser, { width: 1440, height: 900 }, lead.email);
  const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
  await e.page.route('**/api/v1/orgs/*/bugs/board*', (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) }));
  await e.page.goto(url);
  await e.page.waitForSelector('text=Could not load the board', { timeout: 30_000 });
  await shot(e.page, 'board-error-desktop'); pairs.push(['board-error-desktop', 'board-error-desktop.png']);
  await e.ctx.close();
  await d.ctx.close();

  const m = await open(browser, { width: 390, height: 844 }, lead.email);
  await m.page.goto(url);
  await m.page.waitForSelector('article.card');
  await shot(m.page, 'board-default-mobile'); pairs.push(['board-default-mobile', 'board-default-mobile.png']);
  await m.ctx.close();

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
  console.log(`Captured ${pairs.length} paired states: ${pairs.map((p) => p[0]).join(', ')}, plus the Move to menu`);
} catch (err) {
  console.log(`FAIL: ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  const notes = [];
  for (const b of created.bugs) { await api(`${created.org}/bugs/${b.id}`, { method: 'DELETE', token: created.token }).catch(() => {}); }
  notes.push(`${created.bugs.length} bug(s) deleted`);
  for (const p of [created.project, created.extra].filter(Boolean)) {
    await api(`${created.org}/projects/${p.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  }
  notes.push('projects archived');
  console.log(`cleanup: ${notes.join(', ')}`);
}
