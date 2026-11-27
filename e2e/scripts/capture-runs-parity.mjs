// I-07 parity capture: the real Test runs and Test run screens next to the locked screenshots (design/screenshots/test-run*).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 capture-runs-parity.mjs
// Writes e2e/parity/stage4/i07/app/*.png and e2e/parity/stage4/i07/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i07" with one suite of nine cases and one run of them (like the prototype's R-31: 5 pass, 2 fail, 1 blocked,
// 1 not run). Cleanup in `finally`: the suite and its cases are deleted and the project archived. The run itself cannot be deleted (BL-027).
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i07');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const KEY = `V${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;

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
const created = { org: '', token: '', project: null, suite: null };
const pairs = [];
const browser = await chromium.launch();
try {
  const admin = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: admin });
  created.org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  const members = (await api(`${created.org}/members?page_size=100`, { token: admin })).items;
  const lead = members.find((m) => m.role === 'qa_lead' && m.user.email.endsWith('@lumenfreight.test')).user;
  created.token = await login(lead.email);
  created.project = await api(`${created.org}/projects`, { method: 'POST', token: created.token, body: { name: 'parity-i07', key: KEY } });
  const envs = await api(`${created.org}/projects/${created.project.id}/environments`, { token: created.token });
  const comp = await api(`${created.org}/projects/${created.project.id}/components`, { method: 'POST', token: created.token, body: { name: 'Checkout' } });
  created.suite = await api(`${created.org}/test-suites`, { method: 'POST', token: created.token, body: { project_id: created.project.id, name: 'Checkout', component_id: comp.id } });
  const titles = ['Apply a valid discount code', 'Reject an expired discount code', 'Recalculate total after changing delivery address',
    'Card payment with 3D Secure on the second attempt', 'Pay with a saved card', 'Guest checkout with a new address', 'Order confirmation email is sent',
    'Download the invoice as PDF', 'Cancel an order before dispatch'];
  const mkStep = (i, text) => ({ action: `${text} ${i}`, expected: `Expected result of ${text.toLowerCase()} ${i}` });
  for (const title of titles) {
    await api(`${created.org}/test-suites/${created.suite.id}/cases`, { method: 'POST', token: created.token, body: { title, steps: [1, 2, 3, 4].map((i) => mkStep(i, 'Step')) } });
  }
  const run = await api(`${created.org}/test-runs`, { method: 'POST', token: created.token, body: {
    project_id: created.project.id, name: 'WEB 2.4.0 regression', environment_id: envs.find((e) => e.name === 'staging')?.id ?? envs[0].id, suite_ids: [created.suite.id] } });
  const plan = ['pass', 'pass', 'fail', 'fail', 'blocked', 'pass', 'pass', 'pass', null];
  for (const [i, result] of plan.entries()) {
    if (!result) continue;
    await api(`${created.org}/test-runs/${run.id}/results/${run.results[i].id}`, { method: 'PATCH', token: created.token,
      body: { result, ...(result === 'fail' ? { failed_step_index: i === 2 ? 2 : 1, actual_result: 'Total went up by 4.20 and SAVE10 disappeared' } : {}) } });
  }

  const d = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'runs list';
  await d.page.goto(`${BASE}/o/lumen/runs`);
  await d.page.waitForSelector('table.t tbody tr');
  await shot(d.page, 'runs-default-desktop'); pairs.push(['runs-default-desktop', 'test-runs-default-desktop.png']);
  step = 'run';
  await d.page.goto(`${BASE}/o/lumen/runs/${run.key}`);
  await d.page.waitForSelector('.case-row .steps-t');
  await shot(d.page, 'run-default-desktop'); pairs.push(['run-default-desktop', 'test-run-default-desktop.png']);
  await d.page.getByRole('button', { name: 'New test run' }).count();
  step = 'the New test run dialog';
  await d.page.goto(`${BASE}/o/lumen/runs`);
  await d.page.getByRole('button', { name: 'New test run' }).first().click();
  await d.page.waitForSelector('.modal');
  await d.page.selectOption('#nr-p', { label: 'parity-i07' });
  await d.page.getByRole('button', { name: /^Checkout \(9 cases\)/ }).click();
  await d.page.fill('#nr-n', 'WEB 2.4.0 regression, round 2');
  await shot(d.page, 'run-dialog-desktop');
  await d.page.keyboard.press('Escape');

  const l = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'loading';
  await l.page.route(/\/api\/v1\/orgs\/[^/]+\/test-runs(\?|$)/, () => { /* never answered */ });
  await l.page.goto(`${BASE}/o/lumen/runs`);
  await l.page.waitForSelector('.sk');
  await shot(l.page, 'runs-loading-desktop'); pairs.push(['runs-loading-desktop', 'test-runs-loading-desktop.png']);
  await l.page.unroute(/\/api\/v1\/orgs\/[^/]+\/test-runs(\?|$)/);
  await l.page.route(/\/api\/v1\/orgs\/[^/]+\/test-runs\/R-\d+$/, () => { /* never answered */ });
  await l.page.goto(`${BASE}/o/lumen/runs/${run.key}`);
  await l.page.waitForSelector('.sk');
  await shot(l.page, 'run-loading-desktop'); pairs.push(['run-loading-desktop', 'test-run-loading-desktop.png']);
  await l.ctx.close();

  const e = await open(browser, { width: 1440, height: 900 }, lead.email);
  step = 'error';
  const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'X-Request-ID' };
  const fail500 = (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 500, contentType: 'application/json', headers: { ...cors, 'X-Request-ID': '7f3c9a12' },
      body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.', details: {} } }) });
  await e.page.route(/\/api\/v1\/orgs\/[^/]+\/test-runs(\?|$)/, fail500);
  await e.page.goto(`${BASE}/o/lumen/runs`);
  await e.page.waitForSelector('.state-box.error');
  await shot(e.page, 'runs-error-desktop'); pairs.push(['runs-error-desktop', 'test-runs-error-desktop.png']);
  await e.page.unroute(/\/api\/v1\/orgs\/[^/]+\/test-runs(\?|$)/);
  await e.page.route(/\/api\/v1\/orgs\/[^/]+\/test-runs\/R-\d+$/, fail500);
  await e.page.goto(`${BASE}/o/lumen/runs/${run.key}`);
  await e.page.waitForSelector('.state-box.error');
  await shot(e.page, 'run-error-desktop'); pairs.push(['run-error-desktop', 'test-run-error-desktop.png']);
  await e.ctx.close();

  const m = await open(browser, { width: 390, height: 844 }, lead.email);
  step = 'mobile';
  await m.page.goto(`${BASE}/o/lumen/runs`);
  await m.page.waitForSelector('table.t tbody tr');
  await shot(m.page, 'runs-default-mobile'); pairs.push(['runs-default-mobile', 'test-runs-default-mobile.png']);
  await m.page.goto(`${BASE}/o/lumen/runs/${run.key}`);
  await m.page.waitForSelector('.case-row');
  await shot(m.page, 'run-default-mobile'); pairs.push(['run-default-mobile', 'test-run-default-mobile.png']);
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
  console.log(`Captured ${pairs.length} paired states: ${pairs.map((p) => p[0]).join(', ')}, plus the New test run dialog`);
} catch (err) {
  console.log(`FAIL at "${step}": ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  const notes = [];
  if (created.suite) notes.push(`suite deleted (${(await api(`${created.org}/test-suites/${created.suite.id}`, { method: 'DELETE', token: created.token }).then(() => 'ok').catch(() => 'failed'))})`);
  if (created.project) await api(`${created.org}/projects/${created.project.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  notes.push('project archived');
  console.log(`cleanup: ${notes.join(', ')}`);
}
