// I-20 keyboard pass (REQ-056): the sign in form, the New bug form and the New test run dialog work with the keyboard alone.
// Sign in by Tab and Enter; every control of the New bug form is reached by Tab and shows a focus indicator; the dialog takes focus,
// keeps Tab inside, closes on Escape and gives focus back to the button that opened it; axe finds nothing serious in the open dialog.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-keyboard.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. Read only: it changes no data.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
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
const log = (m) => console.log(`keyboard: ${m}`);
const check = (c, m) => { if (!c) throw new Error(m); };

const focusInfo = () => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const s = getComputedStyle(e);
  const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none')
    || (e.closest('label, .chip, .switch') && (() => { const p = getComputedStyle(e.closest('label, .chip, .switch')); return p.boxShadow !== 'none' || p.outlineStyle !== 'none'; })());
  return { id: e.id, tag: e.tagName.toLowerCase(), label: (e.getAttribute('aria-label') || e.innerText || e.id || '').slice(0, 30), ring: !!ring };
};

const browser = await chromium.launch();
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);

  // 1. Sign in with the keyboard alone
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await page.focus('#l-email');
  await page.keyboard.type('amara@lumenfreight.test');
  await page.keyboard.press('Tab');
  for (let i = 0; i < 4 && (await page.evaluate(() => document.activeElement?.id)) !== 'l-pass'; i++) await page.keyboard.press('Tab'); // skips a link between the fields
  check((await page.evaluate(() => document.activeElement?.id)) === 'l-pass', 'Tab from the email does not reach the password');
  await page.keyboard.type(PW);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/o/*/dashboard');
  log('sign in: email, Tab, password, Enter reaches the dashboard');

  // 2. The New bug form: every field is reachable and shows where the focus is
  await page.goto(`${BASE}/o/lumen/bugs/new`);
  await page.getByRole('heading', { name: 'Report a bug' }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.focus('#n-title');
  const seen = new Set();
  const noRing = [];
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(120); // a transition on the ring has settled
    const f = await page.evaluate(focusInfo);
    if (f) {
      seen.add(f.id || f.label);
      if (!f.ring && ['input', 'select', 'textarea', 'button'].includes(f.tag)) noRing.push(f.id || f.label);
    }
    await page.keyboard.press('Tab');
  }
  for (const id of ['n-title', 'n-proj', 'n-sev']) check(seen.has(id), `Tab never reaches #${id} on the New bug form`);
  check(noRing.length === 0, `no visible focus on: ${[...new Set(noRing)].slice(0, 6).join(', ')}`);
  log(`new bug form: ${seen.size} controls reached by Tab, all show a focus indicator`);

  // 3. The New test run dialog
  await page.goto(`${BASE}/o/lumen/runs`);
  await page.getByRole('heading', { name: 'Test runs' }).waitFor();
  const opener = page.getByRole('button', { name: 'New test run' }).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.modal');
  check(await page.evaluate(() => !!document.activeElement?.closest('.modal')), 'the dialog did not take focus');
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => !!document.activeElement?.closest('.modal')), `Tab left the dialog at press ${i + 1}`);
  }
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Shift+Tab');
    check(await page.evaluate(() => !!document.activeElement?.closest('.modal')), `Shift+Tab left the dialog at press ${i + 1}`);
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('nextjs-portal').analyze();
  const bad = axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  check(bad.length === 0, `axe on the open dialog: ${bad.map((v) => `${v.id} (${v.impact})`).join(', ')}`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  check(await opener.evaluate((el) => el === document.activeElement), 'focus did not return to New test run after Escape');
  log('dialog: focus inside, Tab and Shift+Tab stay inside, no serious axe finding, Escape closes and focus returns');
  await ctx.close();
} catch (e) {
  failed = true;
  console.error(`keyboard: FAIL ${e.message}`);
} finally {
  await browser.close();
}
if (!failed) log('PASS');
process.exit(failed ? 1 : 0);
