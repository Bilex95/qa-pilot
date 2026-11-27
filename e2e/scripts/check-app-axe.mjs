// I-13 accessibility scan: axe (WCAG 2.0 and 2.1, levels A and AA) on every Stage 4 screen with real content, at 1440 and 390 px.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-app-axe.mjs [--shots]
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. Read only: it changes no data.
// Fails when any screen has a violation (the Next.js development overlay is excluded: it is not part of the product).
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:3000');
const API = arg('--api', 'http://localhost:8000') + '/api/v1';
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const api = async (path, token) => (await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();
const email = 'amara@lumenfreight.test';
const token = (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: PW }) })).json()).access_token;
const orgs = await api('/orgs', token);
const org = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
const bug = (await api(`${org}/bugs?page_size=1`, token)).items[0];
const run = (await api(`${org}/test-runs?page_size=1`, token)).items[0];
const release = (await api(`${org}/releases?page_size=1`, token)).items[0];
const suite = (await api(`${org}/test-suites?page_size=1`, token)).items?.[0] ?? (await api(`${org}/test-suites`, token))[0];
const testCase = suite ? (await api(`${org}/test-suites/${suite.id}/cases?page_size=1`, token)).items[0] : null;

const screens = [
  ['dashboard', '/o/lumen/dashboard', 'h1'],
  ['projects', '/o/lumen/projects', 'table.t tbody tr'],
  ['project overview', '/o/lumen/projects/WEB', '.readout'],
  ['bugs', '/o/lumen/bugs', 'table.t tbody tr'],
  ['new bug', '/o/lumen/bugs/new', 'h1'],
  ['bug detail', `/o/lumen/bugs/${bug.key}`, '.timeline'],
  ['board', '/o/lumen/board', '.board'],
  ['test suites', '/o/lumen/tests', 'h1'],
  ...(testCase ? [['test case', `/o/lumen/tests/cases/${testCase.id}`, 'h1']] : []),
  ['test runs', '/o/lumen/runs', 'table.t tbody tr'],
  ['test run', `/o/lumen/runs/${run.key}`, '.case-row'],
  ['releases', '/o/lumen/releases', 'table.t tbody tr'],
  ['release', `/o/lumen/releases/${release.id}`, '.page-head h1 .badge'],
  ['reports', '/o/lumen/reports', '.panel .panel-head h2'],
  ['members', '/o/lumen/members', 'table.t tbody tr'],
  ['settings', '/o/lumen/settings', 'h1'],
  ['not found', '/o/lumen/nothing-here', 'text=Page not found'],
];

const browser = await chromium.launch();
let violations = 0;
try {
  for (const [vp, size] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(90_000);
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('#l-email');
    await page.waitForLoadState('networkidle');
    for (let i = 0; i < 4; i++) { await page.fill('#l-email', email); await page.waitForTimeout(150); if ((await page.inputValue('#l-email')) === email) break; }
    for (let i = 0; i < 4; i++) { await page.fill('#l-pass', PW); await page.waitForTimeout(150); if ((await page.inputValue('#l-pass')) === PW) break; }
    await page.click('button[type=submit]');
    await page.waitForURL('**/o/*/dashboard');
    for (const [name, path, ready] of screens) {
      await page.goto(`${BASE}${path}`);
      await page.waitForSelector(ready);
      await page.waitForLoadState('networkidle');
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('nextjs-portal').analyze();
      if (!result.violations.length) { console.log(`ok   [${vp}] ${name}`); continue; }
      for (const v of result.violations) {
        violations += 1;
        console.log(`FAIL [${vp}] ${name}: ${v.id} (${v.impact}) ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.target.join(' ')}  ${(n.failureSummary ?? '').split('\n')[1] ?? ''}`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(violations ? `FAIL: ${violations} violation(s)` : 'PASS: no axe violations (WCAG 2.0 and 2.1 A and AA) on any screen at 1440 and 390 px');
process.exit(violations ? 1 : 0);
