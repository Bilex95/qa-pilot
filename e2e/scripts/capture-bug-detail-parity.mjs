// I-05 parity capture: the real Bug detail next to the locked screenshots (design/screenshots/bug-detail-*).
//
// Usage (stack up, baseline seeded):
//   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\e2e.ps1 capture-bug-detail-parity.mjs
// Writes e2e/parity/stage4/i05/app/*.png and e2e/parity/stage4/i05/compare/*.png (locked on the left, app on the right).
// Test data: a project "parity-i05" with one bug that has steps, two files, two comments and a few changes, created through the API and
// removed in `finally` (files deleted, bug soft deleted, project archived). Reads SEED_USER_PASSWORD from ../.env and never prints it.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000/api/v1';
const LOCKED = resolve(root, 'design', 'screenshots');
const OUT = resolve(root, 'e2e', 'parity', 'stage4', 'i05');
const APP = resolve(OUT, 'app');
const CMP = resolve(OUT, 'compare');
mkdirSync(APP, { recursive: true });
mkdirSync(CMP, { recursive: true });
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const RUN = Date.now();
const KEY = `X${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
// A 1 x 1 PNG, so the screenshot file is a real image
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* 204 */ }
  if (!res.ok && method !== 'DELETE') throw new Error(`${method} ${path.split('?')[0]} answered ${res.status}`);
  return json;
};
const login = async (email) => (await api('/auth/login', { method: 'POST', body: { email, password: PW } })).access_token;
const attach = async (token, orgPath, bugId, name, type, buffer) => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  const res = await fetch(`${API}${orgPath}/bugs/${bugId}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (res.status !== 201) throw new Error(`could not attach ${name}: ${res.status}`);
};

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

const created = { org: '', token: '', project: null, bug: null, labels: [] };
let step = 'setup';
const pairs = [];
const browser = await chromium.launch();
try {
  const admin = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: admin });
  created.org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
  const members = (await api(`${created.org}/members?page_size=100`, { token: admin })).items;
  const who = (role, n = 0) => members.filter((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test'))[n]?.user;
  const lead = who('qa_lead'); const dev = who('developer'); const qa = who('qa_engineer');
  created.token = await login(lead.email);
  const devToken = await login(dev.email);
  created.project = await api(`${created.org}/projects`, { method: 'POST', token: created.token, body: { name: 'parity-i05', key: KEY } });
  const comp = await api(`${created.org}/projects/${created.project.id}/components`, { method: 'POST', token: created.token, body: { name: 'Checkout' } });
  const envs = await api(`${created.org}/projects/${created.project.id}/environments`, { token: created.token });
  const labels = [];
  for (const name of ['Parity regression', 'Parity payments']) {
    const label = await api(`${created.org}/labels`, { method: 'POST', token: created.token, body: { name } });
    labels.push(label); created.labels.push(label);
  }
  const bug = await api(`${created.org}/bugs`, { method: 'POST', token: qa ? await login(qa.email) : created.token, body: {
    project_id: created.project.id, title: 'Checkout total ignores discount code after changing delivery address',
    description: 'After applying discount code SAVE10 at checkout, changing the delivery address recalculates shipping but drops the discount. The order total goes up by the discount amount and the code disappears from the summary. Seen by 3 customers in support tickets today.',
    steps_to_reproduce: ['Sign in as a shipper with a parcel in the cart.', 'Apply discount code SAVE10.', 'On the checkout page choose Change address and pick another saved address.', 'Look at the order summary.'],
    expected_result: 'Total includes the new shipping cost and still applies SAVE10.', actual_result: 'SAVE10 is removed and the total rises by the discount amount.',
    severity: 'high', priority: 'p2', component_id: comp.id, environment_id: envs[0]?.id, label_ids: labels.slice(0, 2).map((l) => l.id) } });
  created.bug = bug;
  await attach(created.token, created.org, bug.id, 'checkout-summary.png', 'image/png', PNG);
  await attach(created.token, created.org, bug.id, 'console.log', 'text/plain', Buffer.from('ERROR checkout: discount code dropped\n'.repeat(12)));
  await api(`${created.org}/bugs/${bug.id}/transitions`, { method: 'POST', token: created.token, body: { to_status: 'triaged' } });
  await api(`${created.org}/bugs/${bug.id}`, { method: 'PATCH', token: created.token, body: { severity: 'critical', priority: 'p1', assignee_id: dev.id } });
  await api(`${created.org}/bugs/${bug.id}/transitions`, { method: 'POST', token: devToken, body: { to_status: 'in_progress' } });
  await api(`${created.org}/bugs/${bug.id}/comments`, { method: 'POST', token: devToken,
    body: { body: 'Looks like the address change rebuilds the cart without the applied codes. Working on a fix in the pricing service.' } });
  await api(`${created.org}/bugs/${bug.id}/comments`, { method: 'POST', token: created.token,
    body: { body: 'Confirmed on staging with SAVE10 and SPRING15. Raising to Critical because it changes what customers pay.' } });
  const url = `${BASE}/o/lumen/bugs/${bug.key}`;

  const d = await open(browser, { width: 1440, height: 900 }, lead.email);
  await d.page.goto(url);
  step = 'the default state shows a comment';
  await d.page.waitForSelector('.timeline li[data-comment-id]');
  await shot(d.page, 'bug-detail-default-desktop'); pairs.push(['bug-detail-default-desktop', 'bug-detail-default-desktop.png']);
  await d.page.screenshot({ path: resolve(APP, 'bug-detail-default-desktop-full.png'), fullPage: true });

  // Loading: hold the bug request open while the screenshot is taken
  const l = await open(browser, { width: 1440, height: 900 }, lead.email);
  await l.page.route(/\/api\/v1\/orgs\/[^/]+\/bugs\/[A-Z]+-\d+$/, () => { /* never answered: the page stays in its loading state */ });
  await l.page.goto(url);
  step = 'the loading state shows a skeleton';
  await l.page.waitForSelector('.sk');
  await shot(l.page, 'bug-detail-loading-desktop'); pairs.push(['bug-detail-loading-desktop', 'bug-detail-loading-desktop.png']);
  await l.ctx.close();

  // Error: the bug does not exist (the locked error state is the "was not found" panel)
  await d.page.goto(`${BASE}/o/lumen/bugs/${KEY}-999`);
  step = 'the error state says the bug was not found';
  await d.page.waitForSelector('text=was not found');
  await shot(d.page, 'bug-detail-error-desktop'); pairs.push(['bug-detail-error-desktop', 'bug-detail-error-desktop.png']);

  // States the locked screenshots do not have: the Viewer, a comment being edited, the delete dialog
  await d.page.goto(url);
  step = 'the delete dialog opens';
  await d.page.waitForSelector('.timeline li[data-comment-id]');
  await d.page.getByRole('button', { name: 'Delete bug' }).click();
  await d.page.waitForSelector('[role=dialog]');
  await shot(d.page, 'bug-detail-delete-dialog-desktop');
  await d.page.keyboard.press('Escape');
  await d.ctx.close();

  const m = await open(browser, { width: 390, height: 844 }, lead.email);
  await m.page.goto(url);
  await m.page.waitForSelector('.timeline li[data-comment-id]');
  await shot(m.page, 'bug-detail-default-mobile'); pairs.push(['bug-detail-default-mobile', 'bug-detail-default-mobile.png']);
  await m.ctx.close();

  const viewer = who('viewer');
  const v = await open(browser, { width: 1440, height: 900 }, viewer.email);
  await v.page.goto(url);
  await v.page.waitForSelector('.timeline li[data-comment-id]');
  await shot(v.page, 'bug-detail-viewer-desktop');
  await v.ctx.close();

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
  console.log(`Captured ${pairs.length} paired states: ${pairs.map((p) => p[0]).join(', ')}, plus the delete dialog and the Viewer`);
} catch (err) {
  console.log(`FAIL at "${step}": ${String(err.message || err).split(/\r?\n/)[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  const notes = [];
  if (created.bug) {
    const list = await api(`${created.org}/bugs/${created.bug.id}/attachments`, { token: created.token }).catch(() => []);
    for (const f of list ?? []) await api(`${created.org}/attachments/${f.id}`, { method: 'DELETE', token: created.token }).catch(() => {});
    notes.push(`${(list ?? []).length} file(s) removed`);
    await api(`${created.org}/bugs/${created.bug.id}`, { method: 'DELETE', token: created.token }).catch(() => {});
    notes.push('bug deleted');
  }
  for (const l of created.labels) await api(`${created.org}/labels/${l.id}`, { method: 'DELETE', token: created.token }).catch(() => {});
  notes.push(`${created.labels.length} label(s) removed`);
  if (created.project) await api(`${created.org}/projects/${created.project.id}`, { method: 'PATCH', token: created.token, body: { archived: true } }).catch(() => {});
  notes.push('project archived');
  console.log(`cleanup: ${notes.join(', ')}`);
}
