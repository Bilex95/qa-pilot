// Link encoding check (CodeQL alert 2): a project id with URL special characters must not leak into the "See breaching bugs" link as
// extra query parameters or a hash. The projects API and the dashboard API are mocked with page.route: the project list gets one more
// project whose id is `abc&x=1#frag`, and any request that filters by that id is answered with the unfiltered real answer.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-link-encoding.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. Creates no data, so there is nothing to clean up
// beyond closing the browser (in `finally`).
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:3000');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const EVIL_ID = 'abc&x=1#frag';
const log = (m) => console.log(`link-encoding: ${m}`);
const check = (c, m) => { if (!c) throw new Error(m); };

async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}

async function main() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('#l-email');
    await page.waitForLoadState('networkidle');
    await fillStable(page, '#l-email', 'amara@lumenfreight.test');
    await fillStable(page, '#l-pass', PW);
    await page.click('button[type=submit]');
    await page.waitForURL('**/o/*/dashboard');

    // Mock: the project list carries the odd project, and a request filtered by it gets the unfiltered real answer.
    await page.route('**/api/v1/orgs/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('project_id') === EVIL_ID) {
        url.searchParams.delete('project_id');
        return route.continue({ url: url.toString() });
      }
      if (/\/orgs\/[^/]+\/projects$/.test(url.pathname) && route.request().method() === 'GET') {
        const res = await route.fetch();
        const json = await res.json();
        const first = json.items[0];
        json.items = [...json.items, { ...first, id: EVIL_ID, name: 'Odd id project', key: 'ODD' }];
        return route.fulfill({ response: res, json });
      }
      return route.continue();
    });

    await page.goto(`${BASE}/o/lumen/dashboard`);
    await page.waitForSelector('.readout');
    await page.selectOption('#d-proj', { label: 'Odd id project' });
    const link = page.getByRole('link', { name: 'See breaching bugs' });
    await link.waitFor();
    const href = await link.getAttribute('href');
    check(href.includes('project=abc%26x%3D1%23frag'), `the href does not carry the encoded id: ${href}`);
    check(!href.includes('#'), `the href carries a raw hash: ${href}`);
    log(`href encoded: ${href}`);

    await link.click();
    await page.waitForURL('**/bugs?**');
    const u = new URL(page.url());
    check(u.searchParams.get('project') === EVIL_ID, `the project parameter is ${u.searchParams.get('project')}`);
    check(!u.searchParams.has('x'), 'a stray x parameter appeared');
    check(u.hash === '', `a hash appeared: ${u.hash}`);
    log('following the link adds no extra parameter and no hash');
    await ctx.close();
  } finally {
    await browser.close();
  }
}

try {
  await main();
  console.log('link-encoding: PASS');
} catch (e) {
  console.error(`link-encoding: FAIL ${e.message}`);
  process.exitCode = 1;
}
