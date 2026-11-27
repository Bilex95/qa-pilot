// REQ-057 automated screen reader review. This reads Playwright's accessibility tree (ariaSnapshot: the roles and names a screen
// reader announces) plus DOM facts, at each step of: sign in (empty submit, wrong password), bug list and a bug, New bug with a
// validation error, the New test run dialog, a release page. It is NOT a test with a real screen reader (NVDA stays a manual check).
// Rules: every button, link, field and dialog has a clear name; fields have labels; errors are announced and linked to the field
// (aria-invalid, aria-describedby to the message, role=alert); one h1 and no skipped heading level; focus is never lost on the body
// after an action; nothing focusable or meaningful is hidden from the tree; a control's aria-label contains its visible text (BL-042).
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-a11y-tree.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it. Creates nothing (the New bug form is not submitted).
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
const log = (m) => console.log(`a11y-tree: ${m}`);

const findings = [];
const found = (screen, element, problem) => findings.push(`${screen} | ${element} | ${problem}`);

const NAMED_ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'dialog', 'searchbox', 'spinbutton', 'tab', 'menuitem', 'slider', 'listbox']);
const GENERIC = /^(button|link|icon|image|img|svg|menu|x|untitled)$/i;

/** What the tree says: roles that need a name must have a clear one; headings in order, exactly one h1. */
function auditTree(screen, snapshot) {
  const levels = [];
  for (const raw of snapshot.split('\n')) {
    const m = raw.match(/^\s*- ([a-z]+)(?: "((?:[^"\\]|\\.)*)")?/);
    if (!m) continue;
    const [, role, name] = m;
    if (NAMED_ROLES.has(role)) {
      if (!name || !name.trim()) found(screen, role, 'has no accessible name');
      else if (GENERIC.test(name.trim()) || !/[\p{L}\p{N}]/u.test(name)) found(screen, `${role} "${name}"`, 'name is generic or an icon glyph');
    }
    if (role === 'heading') levels.push({ name: name ?? '', level: Number(raw.match(/\[level=(\d)\]/)?.[1] ?? 0) });
  }
  const h1 = levels.filter((h) => h.level === 1);
  if (h1.length !== 1) found(screen, 'headings', `${h1.length} h1 elements (need exactly one)`);
  levels.forEach((h, i) => {
    if (i > 0 && h.level > levels[i - 1].level + 1) found(screen, `heading "${h.name}"`, `skips from h${levels[i - 1].level} to h${h.level}`);
  });
}

/** What the DOM adds: field labels, error wiring, dialog names, focusable things hidden from the tree. */
function domFacts() {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const nameOf = (e) => {
    const lb = e.getAttribute('aria-labelledby');
    if (lb) return lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? '').join(' ').trim();
    return (e.getAttribute('aria-label') || [...(e.labels ?? [])].map((l) => l.textContent).join(' ') || e.getAttribute('title') || '').trim();
  };
  const proxy = (e) => e.type === 'file' && e.getAttribute('tabindex') === '-1' && e.getAttribute('aria-hidden') === 'true' && !!e.closest('div, section')?.querySelector('button');
  const desc = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.getAttribute('name') ? `[name=${e.getAttribute('name')}]` : ''}`;
  for (const e of document.querySelectorAll('input, select, textarea')) {
    // A file input kept out of the tab order and the tree is a proxy for a visible named button ("Attach file"), not a control
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(e.type) || !vis(e) || proxy(e)) continue;
    if (!nameOf(e)) out.push({ el: desc(e), problem: 'form field has no label' });
  }
  const live = (e) => !!e.closest('[role=alert], [role=status], [aria-live]');
  for (const e of document.querySelectorAll('[aria-invalid="true"]')) {
    const ids = (e.getAttribute('aria-errormessage') || e.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const msgs = ids.map((i) => document.getElementById(i)).filter((m) => m && m.textContent.trim());
    if (!msgs.length) out.push({ el: desc(e), problem: 'aria-invalid without a linked error message' });
    else if (!msgs.some(live)) out.push({ el: desc(e), problem: 'error message is linked but not announced (no role=alert or aria-live)' });
  }
  for (const f of document.querySelectorAll('.field.invalid')) {
    const c = f.querySelector('input, select, textarea');
    if (c && c.getAttribute('aria-invalid') !== 'true') out.push({ el: desc(c), problem: 'shown as invalid but aria-invalid is not set' });
    if (f.querySelector('.err') && !live(f.querySelector('.err'))) out.push({ el: desc(c ?? f), problem: 'visible error is not announced' });
  }
  for (const d of document.querySelectorAll('[role=dialog]')) {
    if (!nameOf(d)) out.push({ el: 'dialog', problem: 'dialog has no accessible name' });
    if (d.getAttribute('aria-modal') !== 'true') out.push({ el: 'dialog', problem: 'dialog is not aria-modal' });
  }
  const focusable = 'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
  for (const e of document.querySelectorAll(focusable)) {
    if (e.disabled || !vis(e) || proxy(e)) continue;
    if (e.closest('[aria-hidden="true"]')) out.push({ el: desc(e), problem: 'focusable but inside aria-hidden' });
    const r = e.getAttribute('role');
    if (r === 'presentation' || r === 'none') out.push({ el: desc(e), problem: `control with role=${r}` });
  }
  // WCAG 2.5.3 Label in Name (BL-042): when a control has an aria-label (or aria-labelledby), that name must contain the text a person
  // sees on it, so speech input ("click LF Lumen Freight") and screen readers agree. The visible text is built the way axe-core
  // builds it: the rendered text nodes joined with no separator (so two spans need a space node between them), compared after
  // lower casing and dropping punctuation. Text of fewer than two letters or digits (an icon, one glyph) is skipped, as axe does.
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const shown = (root) => {
    let t = '';
    const walk = (n) => {
      if (n.nodeType === 3) { t += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return;
      for (const c of n.childNodes) walk(c);
    };
    walk(root);
    return norm(t);
  };
  const labelled = 'button, a[href], summary, [role=button], [role=link], [role=menuitem], [role=tab], [role=checkbox], [role=switch], [role=radio]';
  for (const e of document.querySelectorAll(labelled)) {
    if (!vis(e) || !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'))) continue;
    const seen = shown(e);
    if ((seen.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) continue;
    const name = norm(nameOf(e));
    if (!name.includes(seen)) out.push({ el: desc(e) + (e.className && typeof e.className === 'string' ? `.${e.className.split(/\s+/)[0]}` : ''), problem: `accessible name "${nameOf(e)}" does not contain the visible text "${seen}" (Label in Name, WCAG 2.5.3)` });
  }
  return out;
}

const focusState = () => {
  const a = document.activeElement;
  if (!a || a === document.body) return { lost: true, where: 'body' };
  return { lost: false, where: `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}`, inMain: !!a.closest('main'), inDialog: !!a.closest('[role=dialog]') };
};

async function audit(page, screen) {
  const snap = await page.locator('body').ariaSnapshot();
  auditTree(screen, snap);
  for (const f of await page.evaluate(domFacts)) found(screen, f.el, f.problem);
  log(`${screen}: ${snap.split('\n').length} tree lines audited`);
}

const browser = await chromium.launch();
let crashed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);

  // 1. Sign in: the page, an empty submit, a wrong password
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await audit(page, 'Sign in');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#l-email-e').waitFor();
  await audit(page, 'Sign in, empty submit');
  const emptyAlert = await page.locator('[role=alert]').allInnerTexts();
  if (!emptyAlert.some((t) => /email/i.test(t))) found('Sign in, empty submit', 'email error', 'not announced as an alert');
  await page.fill('#l-email', 'amara@lumenfreight.test');
  await page.fill('#l-pass', `${PW}-wrong`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('.banner.error').waitFor();
  await audit(page, 'Sign in, wrong password');
  if (!(await page.locator('.banner.error').getAttribute('role'))) found('Sign in, wrong password', 'error banner', 'no role=alert');
  await page.fill('#l-pass', PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/o/*/dashboard');
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForTimeout(500);
  let f = await page.evaluate(focusState);
  if (f.lost) found('After sign in (dashboard)', 'focus', 'focus is lost on the body after the page change');
  await audit(page, 'Dashboard');

  // 2. Bug list and opening a bug (client side navigation by link)
  await page.getByRole('link', { name: 'All bugs', exact: true }).first().click();
  await page.waitForURL('**/bugs');
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.locator('a[href*="/bugs/"]:not([href$="/new"])').first().waitFor();
  await page.waitForTimeout(500);
  f = await page.evaluate(focusState);
  if (f.lost) found('Bug list', 'focus', 'focus is lost on the body after the page change');
  await audit(page, 'Bug list');
  await page.locator('a[href*="/bugs/"]:not([href$="/new"])').first().click();
  await page.waitForURL(/\/bugs\/[^/]+$/);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  f = await page.evaluate(focusState);
  if (f.lost) found('Bug detail', 'focus', 'focus is lost on the body after opening a bug');
  await audit(page, 'Bug detail');

  // 3. New bug with a validation error (not submitted to the server: the form refuses an empty title)
  await page.goto(`${BASE}/o/lumen/bugs/new`);
  await page.getByRole('heading', { name: 'Report a bug' }).waitFor();
  await page.waitForLoadState('networkidle');
  await audit(page, 'New bug');
  await page.locator('button[type=submit]').first().click();
  await page.locator('.field.invalid').first().waitFor();
  await audit(page, 'New bug, validation error');
  const invalid = await page.locator('.field.invalid input, .field.invalid select, .field.invalid textarea').count();
  if (!invalid) found('New bug, validation error', 'form', 'no field was marked invalid');
  const alerts = await page.locator('[role=alert]:visible').count();
  f = await page.evaluate(focusState);
  if (!alerts && (f.lost || !(await page.evaluate(() => document.activeElement?.getAttribute('aria-invalid') === 'true')))) {
    found('New bug, validation error', 'form', 'errors are neither announced nor is focus moved to the first error');
  }

  // 4. A dialog: focus goes in, returns on close
  await page.goto(`${BASE}/o/lumen/runs`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  const opener = page.getByRole('button', { name: 'New test run' }).first();
  await opener.click();
  await page.locator('[role=dialog]').waitFor();
  await page.waitForTimeout(300);
  f = await page.evaluate(focusState);
  if (!f.inDialog) found('New test run dialog', 'focus', `opening the dialog did not move focus into it (on ${f.where})`);
  await audit(page, 'New test run dialog');
  await page.keyboard.press('Escape');
  await page.locator('[role=dialog]').waitFor({ state: 'detached' });
  if (!(await opener.evaluate((el) => el === document.activeElement))) found('New test run dialog', 'focus', 'closing the dialog did not return focus to the button that opened it');

  // 5. A release page
  await page.goto(`${BASE}/o/lumen/releases`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  await audit(page, 'Releases');
  const rel = page.locator('a[href*="/releases/"]').first();
  await rel.waitFor();
  await rel.click();
  await page.waitForURL(/\/releases\/[^/]+$/);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  f = await page.evaluate(focusState);
  if (f.lost) found('Release page', 'focus', 'focus is lost on the body after opening a release');
  await audit(page, 'Release page');
  await ctx.close();
} catch (e) {
  crashed = true;
  console.error(`a11y-tree: FAIL ${e.message}`);
} finally {
  await browser.close();
}
if (findings.length) {
  console.error(`a11y-tree: FAIL ${findings.length} finding(s)`);
  for (const x of [...new Set(findings)]) console.error(`  ${x}`);
}
if (!crashed && !findings.length) log('PASS');
process.exit(crashed || findings.length ? 1 : 0);
