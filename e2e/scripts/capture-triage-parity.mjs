// I-16 parity capture: the real bug page with the AI triage panel idle and with a suggestion, at 1440x900 and 390x844, next to the locked
// screenshots (design/screenshots/bug-detail-default-*.png and bug-detail-ai-desktop.png).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 capture-triage-parity.mjs
// Writes e2e/parity/stage5/i16/app/*.png and e2e/parity/stage5/i16/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i16" with a Checkout component and one bug. Cleanup in `finally`: the bug is deleted and the project archived.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage5', 'i16');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const KEY = `Q${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;

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
const created = { org: '', token: '', project: null, bug: null };
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
  created.project = await api(`${created.org}/projects`, { method: 'POST', token: T, body: { name: 'parity-i16', key: KEY } });
  await api(`${created.org}/projects/${created.project.id}/components`, { method: 'POST', token: T, body: { name: 'Checkout' } });
  created.bug = await api(`${created.org}/bugs`, { method: 'POST', token: T, body: { project_id: created.project.id,
    title: 'Checkout total is higher than the displayed price after changing the delivery address', severity: 'medium',
    description: 'The payment page charges more than the cart showed.', actual_result: 'A payment error is shown in prod.' } });

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
    step = `bug page idle (${tag})`;
    await page.goto(`${BASE}/o/lumen/bugs/${created.bug.key}`);
    await page.getByRole('heading', { name: 'AI triage' }).waitFor();
    await shot(page, `bug-detail-default-${tag}`); pairs.push([`bug-detail-default-${tag}`, `bug-detail-default-${tag}.png`]);
    step = `suggestion (${tag})`;
    await page.getByRole('button', { name: 'Suggest triage' }).click();
    await page.waitForSelector('.ai-panel .suggest');
    await shot(page, `bug-detail-ai-${tag}`);
    if (tag === 'desktop') pairs.push([`bug-detail-ai-${tag}`, `bug-detail-ai-${tag}.png`]);
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
  const del = (path) => api(`${created.org}${path}`, { method: 'DELETE', token: created.token }).catch(() => {});
  if (created.bug) await del(`/bugs/${created.bug.id}`);
  if (created.project) await api(`${created.org}/projects/${created.project.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  console.log('cleanup: bug deleted, project archived');
}
