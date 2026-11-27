// I-13 parity capture: the real Projects and Project overview screens next to the locked screenshots (design/screenshots/projects-* and
// project-overview-*).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 capture-projects-parity.mjs
// Writes e2e/parity/stage4/i13/app/*.png and e2e/parity/stage4/i13/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i13 data" (key Q + 4 letters) with bugs, a run and a release, and an empty project "parity-i13 empty".
// Cleanup in `finally`: bugs, release and suite are deleted and both projects archived (the run stays, BL-027).
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i13');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const letters = [...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('');
const DATA_KEY = `Q${letters}`;
const EMPTY_KEY = `X${letters}`;

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
  await page.waitForURL('**/o/*/dashboard');
  return { ctx, page };
}
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(APP, `${name}.png`) }); };

let step = 'setup';
const created = { org: '', token: '', projects: [], suite: null, release: null, bugs: [] };
const pairs = [];
const browser = await chromium.launch();
try {
  const admin = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: admin });
  created.org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  const members = (await api(`${created.org}/members?page_size=100`, { token: admin })).items;
  const lead = members.find((m) => m.role === 'qa_lead' && m.user.email.endsWith('@lumenfreight.test')).user;
  const T = created.token = await login(lead.email);
  const data = await api(`${created.org}/projects`, { method: 'POST', token: T, body: { name: 'parity-i13 data', key: DATA_KEY, description: 'Checkout and accounts of the customer web app.' } });
  const empty = await api(`${created.org}/projects`, { method: 'POST', token: T, body: { name: 'parity-i13 empty', key: EMPTY_KEY, description: 'A project nobody has used yet.' } });
  created.projects.push(data, empty);
  for (const name of ['Checkout', 'Accounts']) await api(`${created.org}/projects/${data.id}/components`, { method: 'POST', token: T, body: { name } });
  const titles = [['Checkout total ignores discount code after changing delivery address', 'critical'], ['Session expires during checkout without a warning', 'high'],
    ['Notification preferences are not saved when toggled quickly', 'medium']];
  for (const [title, severity] of titles) created.bugs.push(await api(`${created.org}/bugs`, { method: 'POST', token: T, body: { project_id: data.id, title, severity } }));
  created.suite = await api(`${created.org}/test-suites`, { method: 'POST', token: T, body: { project_id: data.id, name: 'Checkout' } });
  for (let i = 1; i <= 6; i++) await api(`${created.org}/test-suites/${created.suite.id}/cases`, { method: 'POST', token: T, body: { title: `Checkout case number ${i}`, steps: [{ action: 'Do it', expected: 'It works' }] } });
  const run = await api(`${created.org}/test-runs`, { method: 'POST', token: T, body: { project_id: data.id, name: 'WEB 2.4.0 regression', suite_ids: [created.suite.id] } });
  for (const [i, result] of ['pass', 'pass', 'pass', 'fail', 'blocked'].entries()) {
    await api(`${created.org}/test-runs/${run.id}/results/${run.results[i].id}`, { method: 'PATCH', token: T, body: { result, ...(result === 'fail' ? { failed_step_index: 0 } : {}) } });
  }
  created.release = await api(`${created.org}/releases`, { method: 'POST', token: T, body: { project_id: data.id, name: 'WEB 2.4.0', target_date: '2026-12-24' } });

  const listUrl = /\/api\/v1\/orgs\/[^/]+\/projects(\?|$)/;
  const oneUrl = /\/api\/v1\/orgs\/[^/]+\/projects\/[0-9a-f-]{36}$/;
  const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
  const fail500 = (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) });

  const d = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'projects list';
  await d.page.goto(`${BASE}/o/lumen/projects`);
  await d.page.waitForSelector('table.t tbody tr');
  await shot(d.page, 'projects-default-desktop'); pairs.push(['projects-default-desktop', 'projects-default-desktop.png']);
  step = 'project overview';
  await d.page.goto(`${BASE}/o/lumen/projects/${DATA_KEY}`);
  await d.page.waitForSelector('.readout');
  await d.page.waitForSelector('text=Latest test runs');
  await d.page.waitForSelector('.panel table.t tbody tr');
  await shot(d.page, 'project-overview-default-desktop'); pairs.push(['project-overview-default-desktop', 'project-overview-default-desktop.png']);
  step = 'dialogs';
  await d.page.getByRole('button', { name: 'Edit project' }).click();
  await d.page.waitForSelector('.modal');
  await shot(d.page, 'project-edit-desktop');
  await d.page.keyboard.press('Escape');
  await d.page.locator('.panel', { hasText: 'Components' }).last().getByRole('button', { name: 'Add' }).click();
  await d.page.waitForSelector('.modal');
  await shot(d.page, 'project-components-desktop');
  await d.page.keyboard.press('Escape');
  await d.page.goto(`${BASE}/o/lumen/projects`);
  await d.page.getByRole('button', { name: 'New project' }).first().click();
  await d.page.waitForSelector('.modal');
  await shot(d.page, 'project-new-desktop');
  await d.page.keyboard.press('Escape');
  step = 'empty overview';
  await d.page.goto(`${BASE}/o/lumen/projects/${EMPTY_KEY}`);
  await d.page.waitForSelector('text=No bugs in parity-i13 empty');
  await shot(d.page, 'project-overview-empty-desktop'); pairs.push(['project-overview-empty-desktop', 'project-overview-empty-desktop.png']);

  const l = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'loading';
  await l.page.route(listUrl, () => { /* never answered */ });
  await l.page.goto(`${BASE}/o/lumen/projects`);
  await l.page.waitForSelector('h1:has-text("Projects")'); // the page, not the sign in bootstrap skeleton that shows first on a cold route
  await l.page.waitForSelector('.sk');
  await shot(l.page, 'projects-loading-desktop'); pairs.push(['projects-loading-desktop', 'projects-loading-desktop.png']);
  await l.page.unroute(listUrl);
  await l.page.goto(`${BASE}/o/lumen/projects/${DATA_KEY}`);
  await l.page.waitForSelector('.readout');
  await l.page.route(oneUrl, () => { /* never answered */ });
  await l.page.goto(`${BASE}/o/lumen/projects/${DATA_KEY}`);
  await l.page.waitForSelector('h1:has-text("parity-i13 data")');
  await l.page.waitForSelector('[role=status] .sk');
  await shot(l.page, 'project-overview-loading-desktop'); pairs.push(['project-overview-loading-desktop', 'project-overview-loading-desktop.png']);
  await l.ctx.close();

  const e = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'empty and error';
  await e.page.route(listUrl, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { items: [], page: 1, page_size: 25, total: 0 } });
  });
  await e.page.goto(`${BASE}/o/lumen/projects`);
  await e.page.waitForSelector('text=No projects yet');
  await shot(e.page, 'projects-empty-desktop'); pairs.push(['projects-empty-desktop', 'projects-empty-desktop.png']);
  await e.page.unroute(listUrl);
  await e.page.route(listUrl, fail500);
  await e.page.goto(`${BASE}/o/lumen/projects`);
  await e.page.waitForSelector('.state-box.error');
  await shot(e.page, 'projects-error-desktop'); pairs.push(['projects-error-desktop', 'projects-error-desktop.png']);
  await e.page.unroute(listUrl);
  await e.page.goto(`${BASE}/o/lumen/projects/${DATA_KEY}`);
  await e.page.waitForSelector('.readout');
  await e.page.route(oneUrl, fail500);
  await e.page.goto(`${BASE}/o/lumen/projects/${DATA_KEY}`);
  await e.page.waitForSelector('.state-box.error');
  await e.page.waitForSelector('h1:has-text("parity-i13 data")');
  await shot(e.page, 'project-overview-error-desktop'); pairs.push(['project-overview-error-desktop', 'project-overview-error-desktop.png']);
  await e.ctx.close();

  const m = await open(browser, { width: 390, height: 844 }, lead.email);
  step = 'mobile';
  await m.page.goto(`${BASE}/o/lumen/projects`);
  await m.page.waitForSelector('table.t tbody tr');
  await shot(m.page, 'projects-default-mobile'); pairs.push(['projects-default-mobile', 'projects-default-mobile.png']);
  await m.page.goto(`${BASE}/o/lumen/projects/${DATA_KEY}`);
  await m.page.waitForSelector('.readout');
  await m.page.waitForSelector('.panel table.t tbody tr');
  await shot(m.page, 'project-overview-default-mobile'); pairs.push(['project-overview-default-mobile', 'project-overview-default-mobile.png']);
  await m.ctx.close();
  await d.ctx.close();

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
  console.log(`Captured ${pairs.length} paired states: ${pairs.map((p) => p[0]).join(', ')}, plus three dialogs`);
} catch (err) {
  console.log(`FAIL at "${step}": ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  const del = (path) => api(`${created.org}${path}`, { method: 'DELETE', token: created.token }).catch(() => {});
  for (const b of created.bugs) await del(`/bugs/${b.id}`);
  if (created.release) await del(`/releases/${created.release.id}`);
  if (created.suite) await del(`/test-suites/${created.suite.id}`);
  for (const p of created.projects) await api(`${created.org}/projects/${p.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  console.log('cleanup: bugs, release and suite deleted, projects archived');
}
