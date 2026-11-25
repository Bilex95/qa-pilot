// Sign out from every signed in page (Stage 4 setup task 4).
// For each page, at a desktop and a phone width: sign in, open the page, choose Sign out from the user menu, then
//   1. exactly one navigation to /login, with no query string (no "come back to the old workspace" link)
//   2. no further navigation for 2 seconds (the sign in page does not mount twice)
//   3. text typed into the sign in form afterwards is kept
//   4. the session really ended (refresh returns 401)
// Usage (from e2e/, stack up, baseline seeded): node scripts/check-signout.mjs [--base http://localhost:3000]
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--base');
const BASE = i > -1 ? process.argv[i + 1] : 'http://localhost:3000';
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

// Every page inside the signed in shell (sidebar sections, the report bug form and the in shell 404)
const PAGES = ['dashboard', 'projects', 'bugs', 'board', 'tests', 'runs', 'releases', 'reports', 'members', 'ai-usage',
  'settings', 'bugs/new', 'this-page-does-not-exist'].map((p) => `/o/lumen/${p}`);
const VIEWPORTS = [{ label: '1440', width: 1440, height: 900 }, { label: '390', width: 390, height: 844 }];
const TYPED = 'typed.after.signout@example.test';

const failures = [];
let checks = 0;
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  for (const path of PAGES) {
    const where = `[${vp.label}] ${path}`;
    for (let attempt = 1; attempt <= 2; attempt++) try {
      // Sign in through the session route (sets the httpOnly cookie), then open the page
      const res = await page.request.post(`${BASE}/api/session/login`, { data: { email: 'amara@lumenfreight.test', password: PW } });
      if (!res.ok()) throw new Error(`sign in failed with ${res.status()}`);
      await page.goto(`${BASE}${path}`);
      await page.waitForSelector('.user-btn');
      await page.waitForLoadState('networkidle');

      const toLogin = [];
      const onNav = (f) => { if (f === page.mainFrame() && new URL(f.url()).pathname === '/login') toLogin.push(f.url()); };
      page.on('framenavigated', onNav);
      await page.click('.user-btn');
      await page.click('.menu >> text=Sign out');
      await page.waitForURL((u) => u.pathname === '/login');
      await page.waitForSelector('#l-email');
      await page.waitForTimeout(2000); // a second mount or redirect would happen here
      const afterSettle = toLogin.length;
      await page.fill('#l-email', TYPED);
      await page.waitForTimeout(1500);
      const kept = await page.inputValue('#l-email');
      page.off('framenavigated', onNav);

      const search = new URL(page.url()).search;
      const refresh = await page.request.post(`${BASE}/api/session/refresh`);
      checks++;
      if (afterSettle !== 1) failures.push(`${where}: ${afterSettle} navigations to /login after Sign out (expected exactly 1): ${toLogin.join(', ')}`);
      if (toLogin.length !== afterSettle) failures.push(`${where}: navigated again after the user started typing`);
      if (search) failures.push(`${where}: sign in page has a query string (${search}); expected a plain /login`);
      if (kept !== TYPED) failures.push(`${where}: text typed after Sign out was not kept (field holds "${kept}")`);
      if (refresh.status() !== 401) failures.push(`${where}: session still alive after Sign out (refresh returned ${refresh.status()})`);
      console.log(`${failures.some((f) => f.startsWith(where)) ? 'FAIL' : 'ok  '} ${where}`);
      break;
    } catch (e) {
      const message = String(e.message || e).split(/\r?\n/)[0];
      // The check itself could not run (the dev server dropped a connection): once more, so a real result is never lost to a socket error
      if (attempt === 1) { console.log(`retry ${where}: ${message}`); continue; }
      failures.push(`${where}: could not run the check: ${message}`);
      console.log(`FAIL ${where}`);
    }
  }
  await ctx.close();
}
await browser.close();
if (failures.length) {
  console.log(`FAIL: ${failures.length} problem(s) in ${checks} sign outs`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log(`PASS: ${checks} sign outs from ${PAGES.length} pages at ${VIEWPORTS.map((v) => v.label).join(' and ')} px: one plain /login each, typed text kept, session ended`);
