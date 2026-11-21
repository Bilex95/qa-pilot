// I-05 acceptance flow: the Bug detail screen (SCR-10): status buttons, the Details panel, comments, files and the timeline, as the
// QA Lead, the Developer, the Viewer and the Org Admin.
//
// Usage (stack up, baseline seeded):
//   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\e2e.ps1 check-bug-detail-flow.mjs
// Reads SEED_USER_PASSWORD from ../.env or the environment and never prints it.
//
// Test data: one project (key Y + 4 letters, name "flow-i05-<timestamp>") with three bugs titled "flow-i05 ...". Everything is removed in
// `finally`, also after a failure: files are deleted, bugs are soft deleted and the project is archived (bug keys are never reused, D-016).
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
const PROJECT_NAME = `flow-i05-${RUN}`;
const PROJECT_KEY = `Y${[...String(RUN).slice(-4)].map((c) => String.fromCharCode(65 + Number(c))).join('')}`;
const log = (m) => console.log(`flow-i05: ${m}`);
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
  await page.waitForURL('**/o/lumen/dashboard');
}

const state = { orgId: '', project: null, bugs: [], leadToken: '', deleted: new Set() };
const O = () => `/orgs/${state.orgId}`;
const fresh = async (bug) => (await api(`${O()}/bugs/${bug.id}`, { token: state.leadToken })).json;

async function cleanup() {
  const notes = [];
  let files = 0;
  for (const b of state.bugs) {
    if (state.deleted.has(b.id)) continue;
    const list = await api(`${O()}/bugs/${b.id}/attachments`, { token: state.leadToken });
    for (const f of list.json ?? []) { await api(`${O()}/attachments/${f.id}`, { method: 'DELETE', token: state.leadToken }); files++; }
    const r = await api(`${O()}/bugs/${b.id}`, { method: 'DELETE', token: state.leadToken });
    notes.push(`bug ${b.key} deleted (${r.status})`);
  }
  notes.unshift(`${files} file(s) removed`);
  if (state.label) notes.push(`label removed (${(await api(`${O()}/labels/${state.label.id}`, { method: 'DELETE', token: state.leadToken })).status})`);
  if (state.project) {
    const r = await api(`${O()}/projects/${state.project.id}`, { method: 'PATCH', token: state.leadToken, body: { archived: true } });
    notes.push(`project archived (${r.status})`);
  }
  log(`cleanup: ${notes.join(', ')}`);
}

async function main() {
  const adminToken = await login('amara@lumenfreight.test'); // to find the people by role
  const orgs = await api('/orgs', { token: adminToken });
  state.orgId = orgs.json.find((o) => o.org.slug === 'lumen').org.id;
  const members = (await api(`${O()}/members?page_size=100`, { token: adminToken })).json.items;
  const person = (role, n = 0) => members.filter((m) => m.role === role && m.user.email.endsWith('@lumenfreight.test'))[n]?.user;
  const lead = person('qa_lead'); const dev = person('developer'); const qa = person('qa_engineer'); const viewer = person('viewer');
  const admin = person('org_admin');
  check(lead && dev && qa && viewer && admin, 'the baseline seed has no Org Admin, QA Lead, Developer, QA Engineer or Viewer');
  state.leadToken = await login(lead.email);
  const qaToken = await login(qa.email);

  state.project = (await api(`${O()}/projects`, { method: 'POST', token: state.leadToken, body: { name: PROJECT_NAME, key: PROJECT_KEY } })).json;
  check(state.project?.id, 'could not create the project');
  const make = async (title, extra = {}) => {
    const r = await api(`${O()}/bugs`, { method: 'POST', token: state.leadToken, body: { project_id: state.project.id, title: `flow-i05 ${title}`, ...extra } });
    check(r.status === 201, `could not create ${title}: ${r.status}`);
    state.bugs.push(r.json);
    return r.json;
  };
  const bugA = await make('A main bug', {
    description: 'After applying a discount code the total goes up.\nSecond line of the description.',
    steps_to_reproduce: ['Apply the code', 'Change the address', 'Look at the total'],
    expected_result: 'The code stays applied.', actual_result: 'The code is removed.' });
  const bugB = await make('B assigned to the QA engineer', { assignee_id: qa.id });
  const bugC = await make('C nobody has, deleted in the flow');
  const bugD = await make('D nobody has, the Developer takes it');
  log(`project ${PROJECT_KEY} with ${bugA.key}, ${bugB.key}, ${bugC.key} and ${bugD.key}`);
  const url = (b) => `${BASE}/o/lumen/bugs/${b.key}`;
  state.label = (await api(`${O()}/labels`, { method: 'POST', token: state.leadToken, body: { name: `flow-i05-${RUN % 100000}` } })).json;
  const flowLabel = state.label;
  check(flowLabel?.id, 'could not create the label');

  const browser = await chromium.launch();
  try {
    // ---- QA Lead -------------------------------------------------------------------------------------------------------------
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await signIn(page, lead.email);
    const toast = (text) => page.locator('#toasts').getByText(text, { exact: false }).first();
    const entry = (text) => page.locator('.timeline li', { hasText: text }).first();
    await page.goto(url(bugA));
    await page.waitForSelector('.page-head h1');
    check((await page.locator('.page-head h1').innerText()) === bugA.title, 'the title is not shown');
    check((await page.locator('.page-head .badge.st-new').count()) === 1, 'the New badge is missing');
    const body = await page.locator('.prose').innerText();
    check(body.includes('Second line of the description.') && body.includes('Apply the code') && body.includes('The code stays applied.') && body.includes('The code is removed.'), 'the description, steps or results are missing');
    check((await page.locator('.prose ol li').count()) === 3, 'three steps expected');
    check((await page.locator('.dl select:disabled').count()) === 0, 'a QA Lead has a disabled select');
    await page.getByRole('button', { name: 'Mark triaged' }).waitFor(); // the workflow loads after the bug
    const buttons = await page.locator('.page-head .actions button').allInnerTexts();
    check(buttons[0] === 'Mark triaged', `the first status button is ${buttons[0]}`);
    check((await page.locator('.page-head .actions button[aria-label="Delete bug"]').count()) === 1, 'the delete button is missing for a QA Lead');
    log('detail: header, description, steps, expected and actual, status buttons, Details panel');

    // 1. Status button: Mark triaged
    await page.getByRole('button', { name: 'Mark triaged' }).click();
    await toast(`${bugA.key} moved to Triaged`).waitFor();
    await page.locator('.page-head .badge.st-triaged').waitFor();
    await entry('changed status').waitFor();
    check((await entry('changed status').innerText()).includes('New') && (await entry('changed status').innerText()).includes('Triaged'), 'the status entry does not name both statuses');
    check((await fresh(bugA)).status === 'triaged', 'the server did not move the bug');
    log('status button: moved, badge changed, the timeline names New and Triaged');

    // 2. Details panel: severity and assignee save on change and show in the timeline
    await page.selectOption('#d-sev', 'critical');
    await entry('changed severity').waitFor();
    check((await entry('changed severity').innerText()).includes('Medium') && (await entry('changed severity').innerText()).includes('Critical'), 'the severity entry is wrong');
    check((await fresh(bugA)).severity === 'critical', 'the severity was not saved');
    await page.selectOption('#d-asg', dev.id);
    await entry('assigned this bug to').waitFor();
    check((await entry('assigned this bug to').innerText()).includes(dev.full_name), 'the assignment entry does not name the person');
    check((await fresh(bugA)).assignee_id === dev.id, 'the assignee was not saved');
    log('Details: severity and assignee saved on change, each in the timeline');

    // 2b. Inline editing of the title, the description and the labels
    await page.getByRole('button', { name: 'Edit title' }).click();
    await page.fill('#e-title', 'abc');
    await page.getByRole('button', { name: 'Save title' }).click();
    await page.getByText('Title must be at least 5 characters.').waitFor();
    await page.fill('#e-title', `${bugA.title} (edited)`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    check((await page.locator('.page-head h1').innerText()) === bugA.title, 'Cancel changed the title');
    await page.getByRole('button', { name: 'Edit title' }).click();
    await page.fill('#e-title', `${bugA.title} (edited)`);
    await page.getByRole('button', { name: 'Save title' }).click();
    await toast('Title updated').waitFor();
    await page.locator('.page-head h1', { hasText: '(edited)' }).waitFor();
    await entry('changed the title').waitFor();
    check((await fresh(bugA)).title === `${bugA.title} (edited)`, 'the title was not saved');
    await page.getByRole('button', { name: 'Edit description' }).click();
    await page.fill('#e-desc', 'Edited description.\nWith a second line.');
    await page.getByRole('button', { name: 'Save description' }).click();
    await toast('Description updated').waitFor();
    await page.getByText('With a second line.').first().waitFor();
    await entry('edited the description').waitFor();
    check((await fresh(bugA)).description === 'Edited description.\nWith a second line.', 'the description was not saved');
    await page.getByRole('button', { name: 'Edit labels' }).click();
    await page.getByRole('button', { name: flowLabel.name, exact: true }).click();
    await page.getByRole('button', { name: 'Save labels' }).click();
    await toast('Labels updated').waitFor();
    await page.locator('.dl .label-chip', { hasText: flowLabel.name }).waitFor();
    await entry('changed the labels').waitFor();
    check((await fresh(bugA)).labels.some((l) => l.id === flowLabel.id), 'the label was not saved');
    log('inline edit: title (a short title is refused, Cancel keeps it), description and labels saved, each in the timeline');

    // 3. Comments: post, tabs, edit, delete
    await fillStable(page, '#c-body', 'Newman style first comment\nwith a second line');
    await page.getByRole('button', { name: 'Post comment' }).click();
    await toast('Comment posted').waitFor();
    const mine = page.locator('.timeline li[data-comment-id]', { hasText: 'Newman style first comment' });
    await mine.waitFor();
    check((await mine.locator('.comment-body').innerText()).includes('with a second line'), 'the line break was lost');
    check((await page.locator('#c-body').inputValue()) === '', 'the comment box was not cleared');
    await page.getByRole('tab', { name: /Comments only/ }).click();
    check((await page.locator('.timeline li:not([data-comment-id])').count()) === 0, 'the comments only tab shows events');
    await page.getByRole('tab', { name: 'Comments and activity' }).click();
    await entry('changed status').waitFor();
    await page.getByRole('button', { name: 'Post comment' }).click(); // empty
    await page.getByText('Write something first.').waitFor();
    await mine.getByRole('button', { name: 'Edit' }).click();
    await page.locator('textarea[id^="c-edit-"]').fill('Edited first comment');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await toast('Comment saved').waitFor();
    const edited = page.locator('.timeline li[data-comment-id]', { hasText: 'Edited first comment' });
    await edited.waitFor();
    check((await edited.innerText()).includes('(edited)'), 'the edited marker is missing');
    log('comments: posted with its line break, the tabs, an empty comment is refused, edit shows (edited)');

    // 4. Files: upload, download, wrong type, too big, remove
    const input = page.locator('#bug-file-input');
    await input.setInputFiles({ name: 'console.log', mimeType: 'text/plain', buffer: Buffer.from('ERROR checkout: code dropped\n') });
    await toast('console.log attached').waitFor();
    await page.getByRole('button', { name: 'Download console.log' }).waitFor();
    await entry('attached').waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download console.log' }).click()]);
    check(download.suggestedFilename() === 'console.log', `the download is named ${download.suggestedFilename()}`);
    const saved = readFileSync(await download.path(), 'utf8');
    check(saved === 'ERROR checkout: code dropped\n', 'the downloaded file is not what was uploaded');
    await input.setInputFiles({ name: 'tool.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
    await toast('That file type is not allowed').waitFor();
    await input.setInputFiles({ name: 'big.log', mimeType: 'text/plain', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 97) });
    await toast('larger than 10 MB').waitFor();
    await input.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is text, not a png') });
    await toast('not what its name says').waitFor();
    check((await page.getByRole('button', { name: /^Download / }).count()) === 1, 'a refused file was attached');
    log('files: uploaded, downloaded unchanged, a wrong type, a file over 10 MB and a fake PNG are refused with a message');

    // The limit of ten files: nine more through the API, then the button is disabled
    for (let i = 2; i <= 10; i++) {
      const form = new FormData();
      form.append('file', new Blob([`file ${i}\n`], { type: 'text/plain' }), `extra-${i}.txt`);
      const r = await fetch(`${API}/api/v1${O()}/bugs/${bugA.id}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${state.leadToken}` }, body: form });
      check(r.status === 201, `could not add file ${i}: ${r.status}`);
    }
    await page.reload();
    await page.getByRole('button', { name: 'Download console.log' }).waitFor();
    check(await page.getByRole('button', { name: 'Attach file' }).isDisabled(), 'Attach file is enabled with ten files');
    await page.getByRole('button', { name: 'Remove extra-10.txt' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove file' }).click();
    await toast('extra-10.txt removed').waitFor();
    await entry('removed').waitFor();
    check(!(await page.getByRole('button', { name: 'Attach file' }).isDisabled()), 'Attach file stays disabled after a file was removed');
    log('ten files: Attach file is disabled at the limit and works again after a removal');

    // 5. Delete a bug: confirm, then back to the list (bug C)
    await page.goto(url(bugC));
    await page.waitForSelector('.page-head h1');
    await page.getByRole('button', { name: 'Delete bug' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    check((await fresh(bugC)).id === bugC.id, 'Cancel deleted the bug');
    await page.getByRole('button', { name: 'Delete bug' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete bug' }).click();
    await page.waitForURL('**/o/lumen/bugs');
    check((await api(`${O()}/bugs/${bugC.id}`, { token: state.leadToken })).status === 404, 'the bug was not deleted');
    state.deleted.add(bugC.id);
    await page.goto(url(bugC));
    await page.getByText(`Bug ${bugC.key} was not found`).waitFor();
    check((await page.getByRole('link', { name: 'Back to bugs' }).count()) === 1, 'the not found state has no way back');
    log('delete: Cancel keeps the bug, Delete removes it and returns to the list, the address then shows the not found state');
    await ctx.close();

    // ---- Developer ---------------------------------------------------------------------------------------------------------
    const devCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const d = await devCtx.newPage();
    d.setDefaultTimeout(30_000);
    await signIn(d, dev.email);
    const dToast = (text) => d.locator('#toasts').getByText(text, { exact: false }).first();
    await d.goto(url(bugB));
    await d.waitForSelector('.page-head h1');
    await d.getByText('Only the assignee can move this bug.').waitFor();
    check((await d.locator('.page-head .actions button').count()) === 0, 'a Developer has status buttons on a bug of someone else');
    check((await d.getByRole('button', { name: /^Edit (title|description|labels)$/ }).count()) === 0, 'a Developer can edit the title, description or labels of a bug they did not report');
    check((await d.locator('.dl select:not(:disabled)').count()) === 0, 'a Developer can change fields of a bug of someone else');
    // a comment is allowed for everyone
    await fillStable(d, '#c-body', 'Developer asks: which build?');
    await d.getByRole('button', { name: 'Post comment' }).click();
    await dToast('Comment posted').waitFor();
    log('Developer: no status buttons or editable fields on a bug of someone else, comments allowed');
    // bug A is Triaged and assigned to this Developer (step 2): the Start work button is theirs, the lead's files are not
    await d.goto(url(bugA));
    await d.waitForSelector('.page-head h1');
    await d.getByRole('button', { name: 'Start work' }).click();
    await dToast(`${bugA.key} moved to In progress`).waitFor();
    check((await fresh(bugA)).status === 'in_progress', 'the Developer could not start their own bug');
    await d.getByRole('button', { name: /^Download / }).first().waitFor();
    check((await d.getByRole('button', { name: /^Remove / }).count()) === 0, 'a Developer can remove files uploaded by someone else');
    check(!(await d.getByRole('button', { name: 'Attach file' }).isDisabled()) || (await d.getByRole('button', { name: /^Download / }).count()) >= 10, 'a Developer cannot attach files');
    // bug D has nobody: the Developer takes it, attaches a note and removes it again
    await d.goto(url(bugD));
    await d.waitForSelector('.page-head h1');
    check((await d.locator('#d-asg').count()) === 0, 'an unassigned bug shows the assignee select to a Developer');
    await d.getByRole('button', { name: 'Assign to me' }).click();
    await d.locator('.timeline li', { hasText: 'assigned this bug to' }).first().waitFor();
    check((await fresh(bugD)).assignee_id === dev.id, 'Assign to me did not assign the Developer');
    await d.locator('#bug-file-input').setInputFiles({ name: 'dev-note.txt', mimeType: 'text/plain', buffer: Buffer.from('note from the developer\n') });
    await dToast('dev-note.txt attached').waitFor();
    await d.getByRole('button', { name: 'Remove dev-note.txt' }).click();
    await d.getByRole('dialog').getByRole('button', { name: 'Remove file' }).click();
    await dToast('dev-note.txt removed').waitFor();
    log('Developer: starts their bug, cannot remove files of others, takes an unassigned bug, attaches and removes their own file');
    await devCtx.close();

    // ---- Viewer ----------------------------------------------------------------------------------------------------------
    const viewCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const v = await viewCtx.newPage();
    v.setDefaultTimeout(30_000);
    await signIn(v, viewer.email);
    const vToast = (text) => v.locator('#toasts').getByText(text, { exact: false }).first();
    await v.goto(url(bugA));
    await v.waitForSelector('.page-head h1');
    await v.getByText('Viewers can comment but cannot change bugs.').waitFor();
    check((await v.locator('.page-head .actions button').count()) === 0, 'a Viewer has status or delete buttons');
    check((await v.getByRole('button', { name: /^Edit (title|description|labels)$/ }).count()) === 0, 'a Viewer can edit the title, description or labels');
    check((await v.locator('.dl select:not(:disabled)').count()) === 0, 'a Viewer can change fields');
    check((await v.getByRole('button', { name: 'Attach file' }).count()) === 0 && (await v.locator('#bug-file-input').count()) === 0, 'a Viewer can attach files');
    check((await v.getByRole('button', { name: /^Remove / }).count()) === 0, 'a Viewer can remove files');
    const [viewerDownload] = await Promise.all([v.waitForEvent('download'), v.getByRole('button', { name: 'Download console.log' }).click()]);
    check(readFileSync(await viewerDownload.path(), 'utf8') === 'ERROR checkout: code dropped\n', 'the Viewer downloaded a different file');
    await fillStable(v, '#c-body', 'Viewer asks: is this fixed in the next release?');
    await v.getByRole('button', { name: 'Post comment' }).click();
    await vToast('Comment posted').waitFor();
    const viewerComment = v.locator('.timeline li[data-comment-id]', { hasText: 'Viewer asks' });
    await viewerComment.waitFor();
    check((await viewerComment.getByRole('button', { name: 'Edit' }).count()) === 1 && (await viewerComment.getByRole('button', { name: 'Delete' }).count()) === 1, 'a Viewer cannot edit or delete their own comment');
    const leadComment = v.locator('.timeline li[data-comment-id]', { hasText: 'Edited first comment' });
    await leadComment.waitFor();
    check((await leadComment.getByRole('button').count()) === 0, 'a Viewer can edit or delete the comment of someone else');
    log('Viewer: reads, downloads and comments; no buttons, no editable fields, no Attach file; owns only their comment');
    await viewCtx.close();

    // ---- Org Admin: deletes the comment of someone else ------------------------------------------------------------------------
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a = await adminCtx.newPage();
    a.setDefaultTimeout(30_000);
    await signIn(a, admin.email);
    await a.goto(url(bugA));
    const theirs = a.locator('.timeline li[data-comment-id]', { hasText: 'Viewer asks' });
    await theirs.waitFor();
    check((await theirs.getByRole('button', { name: 'Edit' }).count()) === 0, 'an Org Admin can edit the comment of someone else');
    await theirs.getByRole('button', { name: 'Delete' }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Delete comment' }).click();
    await a.locator('#toasts').getByText('Comment deleted').first().waitFor();
    await a.waitForFunction(() => !document.body.innerText.includes('Viewer asks'));
    const left = (await api(`${O()}/bugs/${bugA.id}/comments`, { token: state.leadToken })).json;
    check(left.items.every((c) => !c.body.includes('Viewer asks')), 'the comment is still listed by the API');
    log('Org Admin: deletes the comment of someone else (the audit trail names it), cannot edit it');
    await adminCtx.close();

    // ---- A QA Engineer, by API, proves the QA Engineer rule for files they did not upload ------------------------------------------
    const files = (await api(`${O()}/bugs/${bugA.id}/attachments`, { token: qaToken })).json;
    const refused = await api(`${O()}/attachments/${files[0].id}`, { method: 'DELETE', token: qaToken });
    check(refused.status === 403, `a QA Engineer removed a file uploaded by someone else: ${refused.status}`);
    log('QA Engineer: removing a file uploaded by someone else is refused (403)');
  } finally {
    await browser.close();
  }
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error(`flow-i05: FAIL ${e.message}`);
}
try { await cleanup(); } catch (e) { failed = true; console.error(`flow-i05: cleanup failed: ${e.message}`); }
if (failed) process.exitCode = 1;
else console.log('flow-i05: PASS');
