// Automated checks for the HTML prototype:
//  1. every route renders for every role and state without script errors
//  2. role rules from PERSONAS_AND_ROLES.md are reflected in the UI
//  3. no horizontal page overflow at 390, 768 and 1440 px
//  4. axe (WCAG 2.1 A and AA) has no serious or critical violations on key screens
// Usage (from e2e/): node scripts/check-prototype.mjs
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = pathToFileURL(resolve(root, 'design/reference/approved.html')).href;
const ROLES = ['org_admin', 'qa_lead', 'qa_engineer', 'developer', 'viewer'];
const ROUTES = ['/login', '/register', '/onboarding/org', '/invite/x1', '/o/lumen/dashboard', '/o/lumen/projects', '/o/lumen/projects/WEB',
  '/o/lumen/bugs', '/o/lumen/bugs/new', '/o/lumen/bugs/WEB-142', '/o/lumen/bugs/WEB-141', '/o/lumen/board', '/o/lumen/tests',
  '/o/lumen/tests/cases/TC-103', '/o/lumen/tests/cases/new', '/o/lumen/runs', '/o/lumen/runs/R-31', '/o/lumen/releases',
  '/o/lumen/releases/r1', '/o/lumen/releases/r4', '/o/lumen/reports', '/o/lumen/members', '/o/lumen/settings', '/o/lumen/ai-usage', '/o/lumen/nope'];
const STATES = ['default', 'empty', 'loading', 'error', 'ai', 'failed', 'invite', 'profile'];
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
let errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const open = async (route, role = 'qa_lead', state = 'default') => {
  const p = new URLSearchParams({ role, clean: '1' }); if (state !== 'default') p.set('state', state);
  await page.goto(`${html}#${route}?${p}`); await page.waitForTimeout(30);
};

// Border contrast of form controls (WCAG 1.4.11, Stage 2 gate note): the border must reach 3:1 against
// the background around the control and against the control's own fill. Disabled controls are held to
// the same rule even though WCAG exempts them.
const borderAudit = () => {
  const rgb = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const bgOf = e => { for (let p = e; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const out = [];
  for (const e of document.querySelectorAll('input, select, textarea')) {
    if (['checkbox', 'radio', 'hidden'].includes(e.type) || e.closest('.sr-only')) continue;
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden' || !r.width || parseFloat(s.borderTopWidth) === 0) continue;
    const border = rgb(s.borderTopColor), fill = bgOf(e), around = bgOf(e.parentElement);
    out.push({ id: e.id || e.getAttribute('aria-label') || e.tagName, disabled: e.disabled, border: hex(border), fill: hex(fill), around: hex(around),
      vsAround: +cr(border, around).toFixed(2), vsFill: +cr(border, fill).toFixed(2) });
  }
  return out;
};
const controls = new Map();

// 1. render matrix
let renders = 0;
for (const role of ROLES) for (const route of ROUTES) for (const state of STATES) {
  errors = [];
  await open(route, role, state); renders++;
  for (const c of await page.evaluate(borderAudit)) {
    const key = `${c.id} on ${route}${state !== 'default' ? ' ' + state : ''}`;
    controls.set(key, c);
    if (c.vsAround < 3 || c.vsFill < 3) failures.push(`border contrast: ${key} border ${c.border} is ${c.vsAround}:1 against ${c.around} around it and ${c.vsFill}:1 against its fill ${c.fill}`);
  }
  const text = await page.locator('#app').innerText();
  ok(text.trim().length > 20, `${role} ${route} ${state}: blank page`);
  ok(!/undefined|NaN|\[object Object\]/.test(text), `${role} ${route} ${state}: rendered undefined, NaN or [object Object]`);
  ok(errors.length === 0, `${role} ${route} ${state}: script error ${errors.join('; ')}`);
}

{
  const all = [...controls.values()];
  const onSunk = [...controls.entries()].filter(([, c]) => c.around === '#EEF0ED');
  const disabledLow = [...controls.entries()].filter(([, c]) => c.disabled && (c.vsAround < 3 || c.vsFill < 3));
  const minAround = Math.min(...all.map(c => c.vsAround)), minFill = Math.min(...all.map(c => c.vsFill));
  console.log(`Form controls audited: ${controls.size} (control x screen), ${all.filter(c => c.disabled).length} disabled; lowest border contrast ${minAround}:1 against surroundings, ${minFill}:1 against own fill`);
  console.log(`Controls sitting on --surface-sunk (#EEF0ED): ${onSunk.length}${onSunk.length ? ': ' + onSunk.map(([k]) => k).join('; ') : ''}`);
  console.log(`Disabled controls under 3:1: ${disabledLow.length}${disabledLow.length ? ', e.g. ' + disabledLow.slice(0, 3).map(([k, c]) => `${k} (${c.vsFill}:1 vs its ${c.fill} fill)`).join('; ') : ''}`);
  if (onSunk.length) failures.push(`${onSunk.length} form control(s) sit on --surface-sunk; give them a white fill`);
}

// 2. role rules
const count = sel => page.locator(sel).count();
await open('/o/lumen/dashboard', 'viewer');
ok(await count('a:has-text("Report bug")') === 0, 'viewer must not see Report bug');
ok(await count('nav a:has-text("Members")') === 0, 'viewer must not see Members');
ok(await count('nav a:has-text("AI usage")') === 0, 'viewer must not see AI usage');
await open('/o/lumen/bugs/WEB-142', 'viewer');
ok(await count('#c-body') === 1, 'viewer can comment (D-007)');
ok(await count('[data-action="transition"]') === 0, 'viewer has no status buttons');
ok(await page.locator('#d-sev').isDisabled(), 'viewer cannot edit severity');
ok(await count('text=AI triage') === 0, 'viewer has no AI triage');
await open('/o/lumen/bugs/WEB-141', 'developer');
ok(await count('[data-action="self-assign"]') === 1, 'developer can self assign an unassigned bug (D-006)');
ok(await count('[data-action="transition"][data-to="in_progress"]') === 1, 'developer can start an unassigned triaged bug');
await open('/o/lumen/bugs/WEB-137', 'developer');
ok(await count('[data-action="transition"]') === 0, 'developer cannot move a bug assigned to someone else');
ok(await count('[data-action="self-assign"]') === 0, 'developer cannot take an assigned bug');
await open('/o/lumen/bugs/new', 'developer');
ok(await page.locator('#n-sev').isDisabled(), 'developer cannot set severity (D-032)');
await open('/o/lumen/bugs/WEB-142', 'qa_engineer');
ok(await page.locator('#d-sev').isEnabled(), 'QA engineer can set severity');
ok(await count('[data-action="confirm-delete"]') === 0, 'QA engineer cannot delete bugs');
await open('/o/lumen/members', 'qa_lead');
ok(await count('select[data-action="role-change"]') === 0, 'QA lead sees members read only');
await open('/o/lumen/members', 'qa_engineer');
ok(await count('text=You do not have access to Members') === 1, 'QA engineer is denied the members screen');
await open('/o/lumen/settings', 'qa_lead');
ok(await count('[role="tab"]:has-text("Labels")') === 1 && await count('[role="tab"]:has-text("Organization")') === 0, 'QA lead settings tabs are Labels and My profile');
await open('/o/lumen/releases/r1', 'qa_engineer');
ok(await count('text=Draft summary') === 0, 'QA engineer cannot draft a release summary');
// board refuses a move that is not allowed
await open('/o/lumen/board', 'developer');
await page.click('[data-action="move-menu"][data-key="WEB-137"]');
ok(await page.locator('.menu button[data-to="in_progress"]').isDisabled(), 'board move menu disables a move the developer may not make');

// 3. responsive layout (D-035)
const WIDTHS = [320, 360, 375, 390, 412, 430, 768, 1024, 1440];
const LAYOUT_CASES = [...ROUTES.map(r => [r, 'org_admin', 'default']),
  ['/o/lumen/bugs/WEB-142', 'qa_lead', 'ai'], ['/o/lumen/bugs/new', 'qa_engineer', 'ai'], ['/o/lumen/bugs/new', 'developer', 'default'],
  ['/o/lumen/tests/cases/new', 'qa_lead', 'ai'], ['/o/lumen/runs/R-31', 'qa_lead', 'failed'], ['/o/lumen/releases/r1', 'qa_lead', 'ai'],
  ['/o/lumen/members', 'org_admin', 'invite'], ['/o/lumen/settings', 'org_admin', 'profile'], ['/login', 'qa_lead', 'error'],
  ['/register', 'qa_lead', 'error'], ['/o/lumen/bugs', 'qa_lead', 'empty'], ['/o/lumen/dashboard', 'qa_lead', 'error'],
  ['/o/lumen/bugs', 'viewer', 'default'], ['/o/lumen/board', 'developer', 'default']];
const layoutAudit = (checkTargets) => {
  const W = document.documentElement.clientWidth;
  const out = [];
  const visible = e => {
    if (e.closest('.sr-only, .skip, #tip, #toasts, .devbar')) return false;
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const fits = e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= W + 1; };

  // contained: some ancestor scroll container that itself fits the screen holds this element
  const contained = e => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && fits(p)) return true;
    }
    return false;
  };
  const name = e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.classList.length ? '.' + [...e.classList].join('.') : ''} "${(e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
  // page level sideways scroll
  const over = document.documentElement.scrollWidth - W;
  if (over > 0) out.push(`page scrolls sideways by ${over}px`);
  // elements wider than the screen (unless inside their own scroll container that fits)
  const all = [...document.querySelectorAll('#app *, body > .modal-back *')].filter(visible);
  for (const e of all) {
    if (fits(e) || contained(e)) continue;
    const parent = e.parentElement;
    const parentBad = parent && parent !== document.body && parent.id !== 'app' && !fits(parent) && !contained(parent);
    if (parentBad) continue; // report only the outermost element that breaks out
    const box = e.getBoundingClientRect();
    out.push(`wider than screen: ${name(e)} spans ${Math.round(box.left)} to ${Math.round(box.right)}`);
  }
  // clipped text
  for (const e of all) {
    if (e.closest('.progress, .track, .score-bar, .sk, .table-wrap, .board, .tabs, .views, .chart, svg')) continue;
    const s = getComputedStyle(e);
    if (!['hidden', 'clip'].includes(s.overflowX) && !['hidden', 'clip'].includes(s.overflowY)) continue;
    if (!e.innerText || !e.innerText.trim()) continue;
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`text clipped in ${name(e)}`);
  }
  // overlapping siblings in toolbars and rows
  for (const c of document.querySelectorAll('.header, .page-head, .actions, .row, .filters, .readout, .card .meta, .case-head, .suggest-actions, .tabs, .views, .legend, .dl, .pager, .copy-row, .modal-foot, .hbar')) {
    if (!visible(c)) continue;
    const kids = [...c.children].filter(k => visible(k) && getComputedStyle(k).position !== 'absolute');
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 1 && iy > 1) out.push(`overlap in ${name(c)}: ${name(kids[i])} and ${name(kids[j])}`);
    }
  }
  // tap targets
  if (checkTargets) {
    const inSentence = a => a.tagName === 'A' && getComputedStyle(a).display === 'inline' && a.closest('p, li, .hint, .sub, .banner, .err');
    for (const e of document.querySelectorAll('#app a[href], #app button, #app input, #app select, #app textarea, #app summary, #app [role="tab"], body > .modal-back button, body > .modal-back input, body > .modal-back select')) {
      if (!visible(e) && !(e.type === 'checkbox' || e.type === 'radio')) continue;
      if (e.type === 'hidden' || inSentence(e)) continue;
      const target = (e.type === 'checkbox' || e.type === 'radio') ? (e.closest('label') || e.parentElement) : e;
      if (!visible(target)) continue;
      const r = target.getBoundingClientRect();
      if (r.height < 44 - 0.5 || r.width < 44 - 0.5) out.push(`tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${name(e)}`);
    }
  }
  return out;
};
const layoutProblems = new Map();
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  for (const [route, role, state] of LAYOUT_CASES) {
    await open(route, role, state);
    await page.evaluate(() => document.fonts.ready);
    const found = await page.evaluate(layoutAudit, width <= 1024);
    for (const f of found) {
      const key = `${f} [${route}${state !== 'default' ? ' ' + state : ''}]`;
      if (!layoutProblems.has(key)) layoutProblems.set(key, []);
      if (!layoutProblems.get(key).includes(width)) layoutProblems.get(key).push(width);
    }
  }
}
for (const [k, ws] of layoutProblems) failures.push(`at ${ws.join(', ')}px: ${k}`);
console.log(`Layout checked: ${LAYOUT_CASES.length} screens and states at ${WIDTHS.join(', ')} px`);

// 4. axe
await page.setViewportSize({ width: 1440, height: 900 });
const axeTargets = [['/login'], ['/o/lumen/dashboard'], ['/o/lumen/bugs'], ['/o/lumen/bugs/WEB-142', 'qa_lead', 'ai'], ['/o/lumen/bugs/new', 'qa_engineer', 'ai'],
  ['/o/lumen/board'], ['/o/lumen/runs/R-31', 'qa_lead', 'failed'], ['/o/lumen/releases/r1', 'qa_lead', 'ai'], ['/o/lumen/members', 'org_admin', 'invite'], ['/o/lumen/settings', 'org_admin']];
let axeCount = 0;
for (const [route, role = 'qa_lead', state = 'default'] of axeTargets) {
  await open(route, role, state);
  await page.evaluate(() => document.fonts.ready);
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = res.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  axeCount++;
  bad.forEach(v => failures.push(`axe ${route} ${state}: ${v.id} (${v.impact}) ${v.nodes.length} node(s): ${v.nodes[0].target.join(' ')}`));
}
await browser.close();
console.log(`Rendered ${renders} route x role x state combinations; ${axeCount} axe scans`);
if (failures.length) { console.log(`FAIL: ${failures.length} problem(s)`); [...new Set(failures)].forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('PASS: no script errors, role rules hold, no element wider than the screen, no clipped or overlapping text, 44 px tap targets up to 1024 px, no serious or critical axe violations');
