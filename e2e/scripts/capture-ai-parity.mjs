// I-15 parity capture: the real New bug screen with the AI Bug Writer next to the locked screenshots (design/screenshots/bug-new-ai-desktop.png
// and bug-new-loading-desktop.png). The default, error and mobile states of the same screen are captured by capture-bugs-parity.mjs.
//
// Usage (stack up, baseline seeded):
//   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\e2e.ps1 capture-ai-parity.mjs
// Writes e2e/parity/stage5/i15/app/*.png and e2e/parity/stage5/i15/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i15" with a Checkout component and three open bugs that read like the title being typed. Cleanup in `finally`:
// the bugs are deleted and the project archived.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage5', 'i15');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const KEY = `P${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const NAME = 'parity-i15';
const TITLE = 'Checkout total ignores discount code after changing delivery address';

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
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(APP, `${name}.png`) }); };

let step = 'setup';
const created = { org: '', token: '', project: null, bugs: [] };
const pairs = [];
const browser = await chromium.launch();
try {
  const admin = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: admin });
  created.org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  const members = (await api(`${created.org}/members?page_size=100`, { token: admin })).items;
  const lead = members.find((m) => m.role === 'qa_lead' && m.user.email.endsWith('@lumenfreight.test')).user;
  const qa = members.find((m) => m.role === 'qa_engineer' && m.user.email.endsWith('@lumenfreight.test')).user;
  const T = created.token = await login(lead.email);
  created.project = await api(`${created.org}/projects`, { method: 'POST', token: T, body: { name: NAME, key: KEY } });
  await api(`${created.org}/projects/${created.project.id}/components`, { method: 'POST', token: T, body: { name: 'Checkout' } });
  const similar = [['Invoice PDF shows the wrong discount code for the checkout total', 'reopened'], ['Checkout total drops the discount code when the address changes', 'in_progress'],
    ['Card payment fails with 3D Secure on the second attempt', 'triaged']];
  const path = { triaged: ['triaged'], in_progress: ['triaged', 'in_progress'], reopened: ['triaged', 'in_progress', 'fixed', 'reopened'] };
  for (const [title, status] of similar) {
    const bug = await api(`${created.org}/bugs`, { method: 'POST', token: T, body: { project_id: created.project.id, title, severity: 'high' } });
    created.bugs.push(bug);
    for (const to of path[status]) await api(`${created.org}/bugs/${bug.id}/transitions`, { method: 'POST', token: T, body: { to_status: to } });
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  step = 'sign in';
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', qa.email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/*/dashboard');
  step = 'open the form and write the notes';
  await page.goto(`${BASE}/o/lumen/bugs/new`);
  await page.waitForSelector('#n-title');
  await page.selectOption('#n-proj', { label: NAME });
  await page.waitForSelector('#n-comp option:has-text("Checkout")', { state: 'attached' });
  await fillStable(page, '#w-notes', 'checkout total wrong after changing address. discount SAVE10 disappears. prod, chrome 131. happened 3 times');
  await fillStable(page, '#w-log', 'PricingError: discount context lost on cart rebuild\n  at rebuildCart (pricing.ts:214)');
  step = 'drafting';
  const writerUrl = /\/api\/v1\/orgs\/[^/]+\/ai\/bug-writer$/;
  await page.route(writerUrl, async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });
  await page.click('button:has-text("Write the report")');
  await page.waitForSelector('.thinking');
  await shot(page, 'bug-new-loading-desktop'); pairs.push(['bug-new-loading-desktop', 'bug-new-loading-desktop.png']);
  step = 'the draft and the duplicate warning';
  await page.waitForSelector('.ai-panel .suggest');
  await page.unroute(writerUrl);
  await fillStable(page, '#n-title', TITLE);
  await page.waitForSelector('.dupes');
  await shot(page, 'bug-new-ai-desktop'); pairs.push(['bug-new-ai-desktop', 'bug-new-ai-desktop.png']);
  await ctx.close();

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
  console.log(`Captured ${pairs.length} paired states: ${pairs.map((p) => p[0]).join(', ')}`);
} catch (err) {
  console.log(`FAIL at "${step}": ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  const del = (path) => api(`${created.org}${path}`, { method: 'DELETE', token: created.token }).catch(() => {});
  for (const b of created.bugs) await del(`/bugs/${b.id}`);
  if (created.project) await api(`${created.org}/projects/${created.project.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  console.log('cleanup: bugs deleted, project archived');
}
