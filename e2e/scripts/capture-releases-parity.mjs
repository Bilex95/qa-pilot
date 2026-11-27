// I-08 parity capture: the real Releases and Release screens next to the locked screenshots (design/screenshots/release*).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 capture-releases-parity.mjs
// Writes e2e/parity/stage4/i08/app/*.png and e2e/parity/stage4/i08/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i08" with a release "WEB 2.4.0" holding 4 bugs (2 Critical, 1 High, 1 Medium) and a run of 9 cases at 63%.
// Cleanup in `finally`: bugs, the release, the suite are deleted and the project archived (the run stays, BL-027).
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i08');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const KEY = `T${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;

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
const created = { org: '', token: '', project: null, suite: null, release: null, bugs: [] };
const pairs = [];
const browser = await chromium.launch();
try {
  const admin = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: admin });
  created.org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  const members = (await api(`${created.org}/members?page_size=100`, { token: admin })).items;
  const lead = members.find((m) => m.role === 'qa_lead' && m.user.email.endsWith('@lumenfreight.test')).user;
  const T = created.token = await login(lead.email);
  created.project = await api(`${created.org}/projects`, { method: 'POST', token: T, body: { name: 'parity-i08', key: KEY } });
  created.suite = await api(`${created.org}/test-suites`, { method: 'POST', token: T, body: { project_id: created.project.id, name: 'Checkout' } });
  for (let i = 1; i <= 9; i++) {
    await api(`${created.org}/test-suites/${created.suite.id}/cases`, { method: 'POST', token: T, body: { title: `Checkout case number ${i}`, steps: [{ action: 'Do it', expected: 'It works' }] } });
  }
  const run = await api(`${created.org}/test-runs`, { method: 'POST', token: T, body: { project_id: created.project.id, name: 'WEB 2.4.0 regression', suite_ids: [created.suite.id] } });
  const plan = ['pass', 'pass', 'fail', 'fail', 'blocked', 'pass', 'pass', 'pass', null];
  for (const [i, result] of plan.entries()) {
    if (result) await api(`${created.org}/test-runs/${run.id}/results/${run.results[i].id}`, { method: 'PATCH', token: T, body: { result, ...(result === 'fail' ? { failed_step_index: 0 } : {}) } });
  }
  created.release = await api(`${created.org}/releases`, { method: 'POST', token: T, body: {
    project_id: created.project.id, name: 'WEB 2.4.0', target_date: '2026-11-24', description: 'New checkout flow and saved payment methods.' } });
  const titles = [['Checkout total ignores discount code after changing delivery address', 'critical'], ['Card payment fails with 3D Secure on the second attempt', 'critical'],
    ['Session expires during checkout without a warning', 'high'], ['Notification preferences are not saved when toggled quickly', 'medium']];
  for (const [title, severity] of titles) {
    created.bugs.push(await api(`${created.org}/bugs`, { method: 'POST', token: T, body: { project_id: created.project.id, title, severity } }));
  }
  await api(`${created.org}/releases/${created.release.id}/bugs`, { method: 'POST', token: T, body: { bug_ids: created.bugs.map((b) => b.id) } });
  await api(`${created.org}/releases/${created.release.id}/runs`, { method: 'POST', token: T, body: { run_ids: [run.id] } });
  const url = `${BASE}/o/lumen/releases/${created.release.id}`;

  const d = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'releases list';
  await d.page.goto(`${BASE}/o/lumen/releases`);
  await d.page.waitForSelector('table.t tbody tr');
  await shot(d.page, 'releases-default-desktop'); pairs.push(['releases-default-desktop', 'releases-default-desktop.png']);
  step = 'release';
  await d.page.goto(url);
  await d.page.waitForSelector('.page-head h1 .badge');
  await d.page.waitForSelector('text=Linked test runs');
  await shot(d.page, 'release-default-desktop'); pairs.push(['release-default-desktop', 'release-detail-default-desktop.png']);
  step = 'dialogs';
  await d.page.getByRole('button', { name: 'Link bugs' }).click();
  await d.page.waitForSelector('.modal');
  await shot(d.page, 'release-link-bugs-desktop');
  await d.page.keyboard.press('Escape');
  await d.page.getByRole('button', { name: 'Mark released' }).first().click();
  await d.page.waitForSelector('.modal');
  await shot(d.page, 'release-mark-released-desktop');
  await d.page.keyboard.press('Escape');

  const l = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'loading';
  const listUrl = /\/api\/v1\/orgs\/[^/]+\/releases(\?|$)/;
  await l.page.route(listUrl, () => { /* never answered */ });
  await l.page.goto(`${BASE}/o/lumen/releases`);
  await l.page.waitForSelector('.sk');
  await shot(l.page, 'releases-loading-desktop'); pairs.push(['releases-loading-desktop', 'releases-loading-desktop.png']);
  await l.page.unroute(listUrl);
  const oneUrl = /\/api\/v1\/orgs\/[^/]+\/releases\/[0-9a-f-]{36}$/;
  await l.page.route(oneUrl, () => { /* never answered */ });
  await l.page.goto(url);
  await l.page.waitForSelector('.sk');
  await shot(l.page, 'release-loading-desktop'); pairs.push(['release-loading-desktop', 'release-detail-loading-desktop.png']);
  await l.ctx.close();

  const e = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'error';
  const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
  const fail500 = (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) });
  await e.page.route(listUrl, fail500);
  await e.page.goto(`${BASE}/o/lumen/releases`);
  await e.page.waitForSelector('.state-box.error');
  await shot(e.page, 'releases-error-desktop'); pairs.push(['releases-error-desktop', 'releases-error-desktop.png']);
  await e.page.unroute(listUrl);
  await e.page.route(oneUrl, fail500);
  await e.page.goto(url);
  await e.page.waitForSelector('.state-box.error');
  await shot(e.page, 'release-error-desktop'); pairs.push(['release-error-desktop', 'release-detail-error-desktop.png']);
  await e.ctx.close();

  const m = await open(browser, { width: 390, height: 844 }, lead.email);
  step = 'mobile';
  await m.page.goto(`${BASE}/o/lumen/releases`);
  await m.page.waitForSelector('table.t tbody tr');
  await shot(m.page, 'releases-default-mobile'); pairs.push(['releases-default-mobile', 'releases-default-mobile.png']);
  await m.page.goto(url);
  await m.page.waitForSelector('.page-head h1 .badge');
  await shot(m.page, 'release-default-mobile'); pairs.push(['release-default-mobile', 'release-detail-default-mobile.png']);
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
  console.log(`Captured ${pairs.length} paired states: ${pairs.map((p) => p[0]).join(', ')}, plus two dialogs`);
} catch (err) {
  console.log(`FAIL at "${step}": ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  const del = (path) => api(`${created.org}${path}`, { method: 'DELETE', token: created.token }).catch(() => {});
  for (const b of created.bugs) await del(`/bugs/${b.id}`);
  if (created.release) await del(`/releases/${created.release.id}`);
  if (created.suite) await del(`/test-suites/${created.suite.id}`);
  if (created.project) await api(`${created.org}/projects/${created.project.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  console.log('cleanup: bugs, release and suite deleted, project archived');
}
