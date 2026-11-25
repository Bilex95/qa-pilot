// I-19 parity capture: the real AI usage screen with a few requests made through the API, at 1440x900 and 390x844, next to the locked
// screenshots (design/screenshots/ai-usage-default-*.png).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 capture-usage-parity.mjs
// Writes e2e/parity/stage5/i19/app/*.png and e2e/parity/stage5/i19/compare/*.png (locked on the left, app on the right).
// Test data: three Bug Writer and one Explain log request by a QA Lead. Usage rows hold metadata only and are not deletable; a reseed
// removes them.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage5', 'i19');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* 204 */ }
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} answered ${res.status}`);
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
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(APP, `${name}.png`), fullPage: true }); };

let step = 'setup';
const pairs = [];
const browser = await chromium.launch();
try {
  const admin = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: admin });
  const org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  const members = (await api(`${org}/members?page_size=100`, { token: admin })).items;
  const lead = members.find((m) => m.role === 'qa_lead' && m.user.email.endsWith('@lumenfreight.test')).user;
  const T = await login(lead.email);
  const project = (await api(`${org}/projects?page_size=5`, { token: T })).items[0];
  step = 'make a few AI requests';
  for (const notes of ['checkout button does nothing after applying a coupon', 'login page shows a blank screen on a slow network', 'export to csv drops the last row']) {
    await api(`${org}/ai/bug-writer`, { method: 'POST', token: T, body: { project_id: project.id, notes } });
  }
  await api(`${org}/ai/explain-log`, { method: 'POST', token: T, body: { log: 'TypeError: Cannot read properties of undefined (reading id)\n    at pay (checkout.js:41:12)' } });

  for (const [tag, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    step = `sign in (${tag})`;
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('#l-email');
    await page.waitForLoadState('networkidle');
    await fillStable(page, '#l-email', lead.email);
    await fillStable(page, '#l-pass', PW);
    await page.click('button[type=submit]');
    await page.waitForURL('**/o/*/dashboard');
    step = `usage screen (${tag})`;
    await page.goto(`${BASE}/o/lumen/ai-usage`);
    await page.getByRole('heading', { name: 'Recent requests' }).waitFor();
    await shot(page, `ai-usage-default-${tag}`); pairs.push([`ai-usage-default-${tag}`, `ai-usage-default-${tag}.png`]);
    await ctx.close();
  }

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
}
