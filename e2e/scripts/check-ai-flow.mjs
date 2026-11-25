// I-15 and I-16 acceptance flow (the last part is AI triage on the bug page): the AI Bug Writer, Explain this log and the duplicate warning on the New bug screen (SCR-11): a draft fills the form
// and nothing is saved, Discard puts the form back, Edit keeps it and focuses the title, Accept keeps it and the saved bug is marked AI
// assisted, every outcome reaches the usage log, a failed suggestion says so, a log is explained into the actual result, similar open bugs
// are warned about after 600 ms and only for a title of 8 characters, a Developer cannot set severity, nothing shows with AI off.
//
// Usage (stack up, baseline seeded):
//   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-ai-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: a project (key Y + 4 letters, "flow-i15-<timestamp>") with a component and one open bug. Cleanup in `finally`: every bug of the
// project is deleted, the project archived and the AI switch of the workspace put back on.
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const BASE = arg('--base', 'http://localhost:3000');
const API = arg('--api', 'http://localhost:8000');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }

const RUN = Date.now();
const KEY = `Y${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const NAME = `flow-i15-${RUN}`;
const EXISTING = 'Checkout total ignores discount code after changing delivery address';
const NOTES = 'Checkout crashes when I press Pay in prod\n1. Open the cart\n2. Press Pay';
const log = (m) => console.log(`flow-i15: ${m}`);
const check = (c, m) => { if (!c) throw new Error(m); };

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 */ }
  return { status: res.status, json };
}
async function login(email) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password: PW } });
  check(r.status === 200, `could not sign in ${email.split('@')[0]}: ${r.status}`);
  return r.json.access_token;
}
async function fillStable(page, selector, value) {
  for (let i = 0; i < 4; i++) {
    await page.fill(selector, value);
    await page.waitForTimeout(150);
    if ((await page.inputValue(selector)) === value) return;
  }
  throw new Error(`could not fill ${selector}`);
}
async function signIn(page, email) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#l-email');
  await page.waitForLoadState('networkidle');
  await fillStable(page, '#l-email', email);
  await fillStable(page, '#l-pass', PW);
  await page.click('button[type=submit]');
  await page.waitForURL('**/o/*/dashboard');
}

const state = { orgId: '', project: null, release: null, adminToken: '', leadToken: '' };
const O = () => `/orgs/${state.orgId}`;

async function cleanup() {
  const notes = [];
  if (state.adminToken) notes.push(`AI switch on (${(await api(`/orgs/${state.orgId}`, { method: 'PATCH', token: state.adminToken, body: { ai_enabled: true } })).status})`);
  if (state.release) notes.push(`release deleted (${(await api(`${O()}/releases/${state.release.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.project) {
    const bugs = (await api(`${O()}/bugs?project_id=${state.project.id}&page_size=100`, { token: state.leadToken })).json?.items ?? [];
    for (const b of bugs) await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken });
    notes.push(`${bugs.length} bug(s) deleted`);
    notes.push(`project archived (${(await api(`${O()}/projects/${state.project.id}`, { method: 'PATCH', token: state.leadToken, body: { archived: true } })).status})`);
  }
  log(`cleanup: ${notes.join(', ')}`);
}

async function main() {
  state.adminToken = await login('amara@lumenfreight.test');
  const orgs = await api('/orgs', { token: state.adminToken });
  state.orgId = orgs.json.find((o) => o.org.slug === 'lumen').org.id;
  const members = (await api(`${O()}/members?page_size=100`, { token: state.adminToken })).json.items;
  const person = (role) => members.find((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test'))?.user;
  const qa = person('qa_engineer'); const lead = person('qa_lead'); const dev = person('developer'); const viewer = person('viewer');
  check(qa && lead && dev && viewer, 'the baseline seed has no QA Engineer, QA Lead, Developer or Viewer');
  state.leadToken = await login(lead.email);
  const T = state.leadToken;

  state.project = (await api(`${O()}/projects`, { method: 'POST', token: T, body: { name: NAME, key: KEY } })).json;
  check(state.project?.id, 'could not create the project');
  await api(`${O()}/projects/${state.project.id}/components`, { method: 'POST', token: T, body: { name: 'Checkout' } });
  const existing = (await api(`${O()}/bugs`, { method: 'POST', token: T, body: { project_id: state.project.id, title: EXISTING, severity: 'high' } })).json;
  check(existing?.id, 'could not create the existing bug');
  const usage = async (feature) => (await api(`${O()}/ai/usage?feature=${feature}&page_size=5`, { token: T })).json.items;
  const bugTotal = async () => (await api(`${O()}/bugs?project_id=${state.project.id}&page_size=100`, { token: T })).json.total;
  log(`project ${KEY} with one open bug`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await signIn(page, qa.email);
    const toast = (text) => page.locator('#toasts').getByText(text, { exact: false }).first();
    const open = async (p) => {
      await p.goto(`${BASE}/o/lumen/bugs/new`);
      await p.getByRole('heading', { name: 'Report a bug' }).waitFor();
      await p.selectOption('#n-proj', { label: NAME });
      await p.waitForSelector('#n-env option:has-text("prod")', { state: 'attached' });
      await p.waitForSelector('#n-comp option:has-text("Checkout")', { state: 'attached' });
    };
    const selectedText = (p, sel) => p.$eval(sel, (el) => el.options[el.selectedIndex].textContent);

    // 1. A draft fills the form and saves nothing
    await open(page);
    await page.locator('.ai-panel').waitFor();
    await page.locator('h1 + p').getByText('let the AI Bug Writer draft it').waitFor();
    await fillStable(page, '#w-notes', NOTES);
    await page.getByRole('button', { name: 'Write the report' }).click();
    await page.locator('.suggest', { hasText: 'AI suggestion, not saved' }).waitFor();
    check((await page.inputValue('#n-title')) === 'Checkout crashes when I press Pay in prod', 'the title was not drafted');
    check((await page.locator('input[aria-label^="Step "]').count()) === 2, 'the draft does not have two steps');
    check((await page.inputValue('#n-sev')) === 'critical', 'a crash is not suggested as Critical');
    check((await selectedText(page, '#n-env')) === 'prod' && (await selectedText(page, '#n-comp')) === 'Checkout', 'environment and component are not mapped');
    check((await page.locator('.suggest').first().innerText()).includes('severity Critical'), 'the suggestion does not say what it filled');
    check((await bugTotal()) === 1, 'the draft saved a bug');
    log('draft: title, two steps, Critical, prod and Checkout filled into the form; nothing saved');

    // 2. Discard puts the form back; the outcome reaches the log
    await page.getByRole('button', { name: 'Discard' }).click();
    check((await page.inputValue('#n-title')) === '' && (await page.inputValue('#n-sev')) === 'medium', 'Discard did not restore the form');
    await page.locator('.suggest p.muted', { hasText: 'Discarded.' }).waitFor();
    await eventually(async () => (await usage('bug_writer'))[0]?.outcome === 'discarded', 'the discarded outcome is not in the log');
    log('discard: the form is as it was, the outcome is "discarded" in the usage log');

    // 3. Edit keeps the draft and focuses the title
    await page.getByRole('button', { name: 'Write the report again' }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    check((await page.evaluate(() => document.activeElement?.id)) === 'n-title', 'Edit did not focus the title');
    check((await page.inputValue('#n-title')).startsWith('Checkout crashes'), 'Edit dropped the draft');
    await eventually(async () => (await usage('bug_writer'))[0]?.outcome === 'edited', 'the edited outcome is not in the log');

    // 4. Accept and save: the bug is AI assisted
    await page.getByRole('button', { name: 'Write the report again' }).click();
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.locator('.suggest p.muted', { hasText: 'Accepted.' }).waitFor();
    await eventually(async () => (await usage('bug_writer'))[0]?.outcome === 'accepted', 'the accepted outcome is not in the log');
    await page.getByRole('button', { name: 'Save bug' }).click();
    await page.waitForURL(/\/o\/lumen\/bugs$/);
    const saved = (await api(`${O()}/bugs?project_id=${state.project.id}&page_size=100`, { token: T })).json.items.find((b) => b.title.startsWith('Checkout crashes'));
    check(saved, 'the accepted draft was not saved');
    const full = (await api(`${O()}/bugs/${saved.id}`, { token: T })).json;
    check(full.ai_assisted === true && full.steps_to_reproduce.length === 2 && full.severity === 'critical', 'the saved bug is not marked AI assisted with the draft');
    log('edit and accept: the outcomes are in the log, the saved bug is AI assisted with the drafted steps and severity');

    // 5. A suggestion that failed says so and leaves the form alone
    await open(page);
    const cors = { 'access-control-allow-origin': BASE, 'access-control-allow-headers': 'authorization,content-type,x-request-id', 'access-control-allow-methods': 'POST,OPTIONS' };
    await page.route(/\/ai\/bug-writer$/, (route) => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({
        title: 'x', description: '', steps_to_reproduce: [], expected_result: '', actual_result: '', environment: null, environment_id: null,
        component: null, component_id: null, suggested_severity: 'medium', missing_information: [], fallback: true, usage_id: '00000000-0000-4000-8000-000000000000' }) }));
    await fillStable(page, '#w-notes', 'Something odd happens');
    await page.getByRole('button', { name: 'Write the report' }).click();
    await page.getByText('AI could not produce a suggestion. You can continue manually.').waitFor();
    check((await page.inputValue('#n-title')) === '', 'a failed suggestion changed the form');
    await page.unroute(/\/ai\/bug-writer$/);
    log('a failed suggestion says "AI could not produce a suggestion" and leaves the form empty');

    // 6. Explain this log, added to the actual result
    await fillStable(page, '#w-log', "INFO start\nKeyError: 'order_id'\nERROR request failed");
    await page.locator('details summary', { hasText: 'Explain this log' }).click();
    await page.locator('details').getByRole('button', { name: 'Explain this log' }).click();
    await page.locator('details .suggest b', { hasText: 'KeyError' }).waitFor();
    await page.getByRole('button', { name: 'Add to actual result' }).click();
    check((await page.inputValue('#n-act')).includes('KeyError'), 'the explanation was not added to the actual result');
    await eventually(async () => (await usage('explain_log'))[0]?.outcome === 'accepted', 'the explain log outcome is not in the log');
    log('explain this log: the error type, the key lines, added to the actual result, outcome in the log');

    // 7. The duplicate warning
    await fillStable(page, '#n-title', 'Discount code is ignored in the checkout total after changing the address');
    await page.locator('.dupes').waitFor();
    const dupe = page.locator('.dupes .dupe').first();
    check((await dupe.innerText()).includes(existing.key) && /\d+% similar/.test(await dupe.innerText()), 'the warning does not show the similar bug with its score');
    check((await dupe.locator('a').getAttribute('target')) === '_blank', 'the duplicate link does not open in a new tab');
    await fillStable(page, '#n-title', 'abc');
    await page.waitForTimeout(1000);
    check((await page.locator('.dupes').count()) === 0, 'a title of 3 characters still shows the warning');
    await fillStable(page, '#n-title', 'Tooltip clipped on the settings icon');
    await page.waitForTimeout(1200);
    check((await page.locator('.dupes').count()) === 0, 'an unrelated title shows the warning');
    log('duplicates: the similar open bug with its score after the typing stops; none for 3 characters or an unrelated title');

    // 7b. AI triage on the bug page (I-16): nothing changes until Accept; Accept is a normal update with activity and an outcome
    const triaged = (await api(`${O()}/bugs`, { method: 'POST', token: T, body: { project_id: state.project.id, title: 'Payment error on Checkout in prod', severity: 'low', priority: 'p4' } })).json;
    check(triaged?.id, 'could not create the bug to triage');
    await page.goto(`${BASE}/o/lumen/bugs/${triaged.key}`);
    await page.getByRole('heading', { name: 'AI triage' }).waitFor();
    await page.getByRole('button', { name: 'Suggest triage' }).click();
    await page.locator('.ai-panel .suggest', { hasText: 'AI suggestion, not saved' }).waitFor();
    const shownText = await page.locator('.ai-panel .suggest').innerText();
    check(/Critical/.test(shownText) && /P1/.test(shownText) && shownText.includes('Checkout') && /payment/.test(shownText), 'the suggestion is not Critical, P1, Checkout with its reason');
    let now = (await api(`${O()}/bugs/${triaged.id}`, { token: T })).json;
    check(now.severity === 'low' && now.priority === 'p4' && now.component_id === null, 'asking for a triage changed the bug');
    await page.locator('.ai-panel').getByRole('button', { name: 'Accept' }).click();
    await toast('Triage applied: Critical, P1, Checkout').waitFor();
    await eventually(async () => (await api(`${O()}/bugs/${triaged.id}`, { token: T })).json.severity === 'critical', 'Accept did not change the bug');
    now = (await api(`${O()}/bugs/${triaged.id}`, { token: T })).json;
    check(now.priority === 'p1' && now.component_id !== null, 'Accept did not change priority and component');
    const trail = (await api(`${O()}/bugs/${triaged.id}/activity`, { token: T })).json.items.map((e) => e.field);
    check(['severity', 'priority', 'component'].every((f) => trail.includes(f)), 'Accept wrote no activity entries');
    await eventually(async () => (await usage('triage'))[0]?.outcome === 'accepted', 'the triage outcome is not in the log');
    await page.getByRole('button', { name: 'Suggest again' }).click();
    await page.locator('.ai-panel').getByRole('button', { name: 'Discard' }).click();
    await eventually(async () => (await usage('triage'))[0]?.outcome === 'discarded', 'the discarded triage is not in the log');
    log('triage: nothing changes on ask, Accept sets Critical, P1 and Checkout with activity entries, outcomes are in the log');

    // 7b. The release summary (I-18): a lead drafts, edits and publishes; a Viewer reads it; a Developer has no panel
    const release = (await api(`${O()}/releases`, { method: 'POST', token: T, body: { project_id: state.project.id, name: `flow-i18-${RUN}` } })).json;
    check(release?.id, 'could not create the release');
    state.release = release;
    await api(`${O()}/releases/${release.id}/bugs`, { method: 'POST', token: T, body: { bug_ids: [triaged.id] } });
    const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const l = await lctx.newPage();
    l.setDefaultTimeout(30_000);
    await signIn(l, lead.email);
    await l.goto(`${BASE}/o/lumen/releases/${release.id}`);
    await l.getByRole('heading', { name: 'Release Readiness Summary' }).waitFor();
    await l.getByRole('button', { name: 'Draft summary' }).click();
    await l.locator('.suggest', { hasText: 'AI suggestion, not saved' }).waitFor();
    check((await l.locator('.suggest').innerText()).includes('Recommendation: Do not ship'), 'a blocked release is not "Do not ship"');
    check((await api(`${O()}/releases/${release.id}`, { token: T })).json.ai_summary === null, 'drafting saved the summary');
    await l.getByRole('button', { name: 'Edit', exact: true }).last().click();
    await fillStable(l, '#rs-text', 'Do not ship: one Critical bug is open.\n\nRecommendation: Do not ship');
    await l.getByRole('button', { name: 'Accept and publish' }).click();
    await l.locator('#toasts').getByText('Summary published', { exact: false }).first().waitFor();
    await eventually(async () => (await api(`${O()}/releases/${release.id}`, { token: T })).json.ai_summary?.startsWith('Do not ship: one Critical'), 'the summary was not saved');
    await eventually(async () => (await usage('release_summary'))[0]?.outcome === 'edited', 'the edited outcome is not in the log');
    await l.getByText('Drafted with AI.', { exact: false }).waitFor();
    const vctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const v2 = await vctx2.newPage();
    v2.setDefaultTimeout(30_000);
    await signIn(v2, viewer.email);
    await v2.goto(`${BASE}/o/lumen/releases/${release.id}`);
    await v2.getByText('Do not ship: one Critical bug is open.', { exact: false }).waitFor();
    check((await v2.locator('.ai-panel').count()) === 0, 'a Viewer sees the AI summary panel');
    await vctx2.close();
    const dctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d2 = await dctx2.newPage();
    d2.setDefaultTimeout(30_000);
    await signIn(d2, dev.email);
    await d2.goto(`${BASE}/o/lumen/releases/${release.id}`);
    await d2.getByRole('heading', { name: 'Release summary' }).waitFor();
    check((await d2.locator('.ai-panel').count()) === 0, 'a Developer sees the AI summary panel');
    await dctx2.close();
    await lctx.close();
    log('release summary: drafted without saving, edited and published, outcome "edited" in the log, a Viewer reads it, no panel for a Developer');

    // 8. A Developer: severity stays Medium, the draft still fills the rest
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d = await dctx.newPage();
    d.setDefaultTimeout(30_000);
    await signIn(d, dev.email);
    await open(d);
    check(await d.locator('#n-sev').isDisabled(), 'a Developer can set the severity');
    await fillStable(d, '#w-notes', NOTES);
    await d.getByRole('button', { name: 'Write the report' }).click();
    await d.locator('.suggest', { hasText: 'AI suggestion, not saved' }).waitFor();
    check((await d.inputValue('#n-title')).startsWith('Checkout crashes') && (await d.inputValue('#n-sev')) === 'medium', 'the Developer draft is wrong');
    check(!(await d.locator('.suggest').first().innerText()).includes('severity'), 'the suggestion offers a severity to a Developer');
    await d.goto(`${BASE}/o/lumen/bugs/${triaged.key}`);
    await d.getByRole('heading', { name: 'Details', exact: true }).waitFor();
    check((await d.locator('.ai-panel').count()) === 0, 'a Developer sees the AI triage panel');
    await dctx.close();
    log('Developer: severity stays Medium and disabled, the rest of the draft fills in, no triage panel');

    // 9. AI off: nothing AI anywhere on the screen
    check((await api(`/orgs/${state.orgId}`, { method: 'PATCH', token: state.adminToken, body: { ai_enabled: false } })).status === 200, 'could not turn AI off');
    await page.goto(`${BASE}/o/lumen/bugs/new`);
    await page.getByRole('heading', { name: 'Report a bug' }).waitFor();
    await page.selectOption('#n-proj', { label: NAME });
    await fillStable(page, '#n-title', 'Discount code is ignored in the checkout total after changing the address');
    await page.waitForTimeout(1500);
    check((await page.locator('.ai-panel').count()) === 0 && (await page.locator('.dupes').count()) === 0, 'AI controls show with AI off');
    const refused = await api(`${O()}/ai/bug-writer`, { method: 'POST', token: await login(qa.email), body: { project_id: state.project.id, notes: 'x' } });
    check(refused.status === 403 && refused.json.error.code === 'ai_disabled', `the API answered ${refused.status} with AI off`);
    await page.goto(`${BASE}/o/lumen/bugs/${triaged.key}`);
    await page.getByRole('heading', { name: 'Details', exact: true }).waitFor();
    await page.waitForTimeout(1500);
    check((await page.locator('.ai-panel').count()) === 0, 'the triage panel shows with AI off');
    const refusedTriage = await api(`${O()}/ai/triage`, { method: 'POST', token: await login(qa.email), body: { bug_id: triaged.id } });
    check(refusedTriage.status === 403 && refusedTriage.json.error.code === 'ai_disabled', `triage answered ${refusedTriage.status} with AI off`);
    await api(`/orgs/${state.orgId}`, { method: 'PATCH', token: state.adminToken, body: { ai_enabled: true } });
    log('AI off: no panel and no warning on the screen, the API answers 403 ai_disabled');

    // 10. A Viewer cannot report a bug at all
    const vctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const v = await vctx.newPage();
    v.setDefaultTimeout(30_000);
    await signIn(v, viewer.email);
    await v.goto(`${BASE}/o/lumen/bugs/new`);
    await v.getByText('Viewers cannot report bugs').waitFor();
    check((await v.locator('.ai-panel').count()) === 0, 'a Viewer sees the AI panel');
    await vctx.close();
    await ctx.close();
  } finally {
    await browser.close();
  }
}

async function eventually(fn, message, tries = 20) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(message);
}

main().then(() => { log('PASS'); }).catch((e) => { console.error(`flow-i15: FAIL ${e.message}`); process.exitCode = 1; }).finally(cleanup);
