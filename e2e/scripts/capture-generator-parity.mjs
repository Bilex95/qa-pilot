// I-17 parity capture: the real New test case screen with the Test Case Generator idle and with its pick list, at 1440x900 and 390x844,
// next to the locked screenshots (design/screenshots/test-case-editor-default-*.png and test-case-editor-ai-desktop.png).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 capture-generator-parity.mjs
// Writes e2e/parity/stage5/i17/app/*.png and e2e/parity/stage5/i17/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i17" with one suite. Cleanup in `finally`: the suite is deleted and the project archived.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage5', 'i17');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const KEY = `G${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const STORY = 'As a shipper I want my discount to stay applied when I change the delivery address, so the price I saw is the price I pay.\n- Discount stays after address change\n- Total shows new shipping cost\n- Expired codes are removed';

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
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: resolve(APP, `${name}.png`), fullPage: true }); };

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
  const qa = members.find((m) => m.role === 'qa_engineer' && m.user.email.endsWith('@lumenfreight.test')).user;
  const T = created.token = await login(lead.email);
  created.project = await api(`${created.org}/projects`, { method: 'POST', token: T, body: { name: 'parity-i17', key: KEY } });
  created.suite = await api(`${created.org}/test-suites`, { method: 'POST', token: T, body: { project_id: created.project.id, name: 'Checkout' } });

  for (const [tag, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60_000);
    step = `sign in (${tag})`;
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('#l-email');
    await page.waitForLoadState('networkidle');
    await fillStable(page, '#l-email', qa.email);
    await fillStable(page, '#l-pass', PW);
    await page.click('button[type=submit]');
    await page.waitForURL('**/o/*/dashboard');
    step = `new case idle (${tag})`;
    await page.goto(`${BASE}/o/lumen/tests/cases/new?suite=${created.suite.id}`);
    await page.getByRole('heading', { name: 'Test Case Generator' }).waitFor();
    await shot(page, `test-case-editor-default-${tag}`); pairs.push([`test-case-editor-default-${tag}`, `test-case-editor-default-${tag}.png`]);
    step = `pick list (${tag})`;
    await fillStable(page, '#g-story', STORY);
    await page.getByRole('button', { name: 'Generate cases' }).click();
    await page.waitForSelector('.ai-panel .gen-case');
    await shot(page, `test-case-editor-ai-${tag}`);
    if (tag === 'desktop') pairs.push([`test-case-editor-ai-${tag}`, `test-case-editor-ai-${tag}.png`]);
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
  if (created.suite) await api(`${created.org}/test-suites/${created.suite.id}`, { method: 'DELETE', token: created.token }).catch(() => {});
  if (created.project) await api(`${created.org}/projects/${created.project.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  console.log('cleanup: suite deleted, project archived');
}
