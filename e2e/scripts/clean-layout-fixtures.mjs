// Removes what a layout check run leaves behind when it is killed before its own cleanup (for example out of memory).
//
// Usage (stack up, baseline seeded):
//   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\e2e.ps1 clean-layout-fixtures.mjs
// It only touches the fixtures the layout check creates, by their fixed names, in the Lumen workspace: the reset fixture person
// (membership removed and every live reset link revoked first), the invitation layout-i10@qapilot.test, the fixture labels, the
// suites, bugs and saved views of the LAYT project (which is archived again). The long names workspace stays: the layout check
// reuses it. Reads SEED_USER_PASSWORD from ../.env and never prints it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveResetLinks, revokeResetLinks } from './revoke-reset-links.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFile = resolve(root, '.env');
const PW = process.env.SEED_USER_PASSWORD
  || (existsSync(envFile) ? (readFileSync(envFile, 'utf8').match(/^SEED_USER_PASSWORD=(.*)$/m)?.[1] ?? '').trim() : '');
if (!PW) { console.error('SEED_USER_PASSWORD missing'); process.exit(2); }
const API = 'http://localhost:8000/api/v1';
const RESET_EMAIL = 'layout-i23@qapilot.test';
const INVITE_EMAIL = 'layout-i10@qapilot.test';
const LABELS = ['Regression', 'Payments', 'Intermittent freight reconciliation fail', 'Flow I11 label'];
const SUITES = ['Layout fixture suite', 'Layout empty suite'];
const VIEWS = ['Layout view check', 'Critical checkout regressions across all supported releases'];

// The stack may have only just come back up after a memory kill: try the sign in a few times before giving up
let login;
for (let i = 0; i < 12; i++) {
  try {
    login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'amara@lumenfreight.test', password: PW }) });
    if (login.ok) break;
  } catch { /* the API is not answering yet */ }
  await new Promise((r) => setTimeout(r, 5000));
}
if (!login?.ok) { console.error(`could not sign in the Lumen admin: ${login?.status ?? 'no answer'}`); process.exit(1); }
const token = (await login.json()).access_token;
const call = async (path, opts = {}) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
      let json = null;
      try { json = await res.json(); } catch { /* 204 */ }
      return { status: res.status, json };
    } catch (e) { // a reset connection while the stack settles: wait and try again, three times at most
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
};
const orgs = (await call('/orgs')).json;
const O = `/orgs/${orgs.find((o) => o.org.slug === 'lumen').org.id}`;
const removed = { member: 0, invitation: 0, labels: [], suites: 0, bugs: 0, views: 0, project: 'none' };

console.log('live reset links before:', JSON.stringify(liveResetLinks([RESET_EMAIL])));
const rev = revokeResetLinks([RESET_EMAIL]);
console.log(`revoked ${rev.revoked}; live after: ${JSON.stringify(rev.after)}`);

for (const m of (await call(`${O}/members?q=layout-i23&page_size=100`)).json.items.filter((x) => x.user.email === RESET_EMAIL)) {
  if ((await call(`${O}/members/${m.membership_id}`, { method: 'DELETE' })).status === 204) removed.member++;
}
for (const i of (await call(`${O}/invitations?status=pending`)).json.filter((x) => x.email === INVITE_EMAIL)) {
  if ((await call(`${O}/invitations/${i.id}`, { method: 'DELETE' })).status === 204) removed.invitation++;
}
const project = (await call(`${O}/projects?include_archived=true&page_size=100`)).json.items.find((p) => p.key === 'LAYT');
if (project) {
  for (const b of (await call(`${O}/bugs?project_id=${project.id}&page_size=100`)).json.items) {
    for (const f of (await call(`${O}/bugs/${b.id}/attachments`)).json ?? []) await call(`${O}/attachments/${f.id}`, { method: 'DELETE' }); // files first
    if ((await call(`${O}/bugs/${b.id}`, { method: 'DELETE' })).status === 204) removed.bugs++;
  }
  for (const s of (await call(`${O}/test-suites?project_id=${project.id}&page_size=100`)).json.items.filter((x) => SUITES.includes(x.name) || x.name.startsWith('Intermittent carrier reconciliation and settlement ledger'))) {
    if ((await call(`${O}/test-suites/${s.id}`, { method: 'DELETE' })).status === 204) removed.suites++;
  }
}
for (const v of (await call(`${O}/saved-views`)).json.filter((x) => VIEWS.includes(x.name))) {
  if ((await call(`${O}/saved-views/${v.id}`, { method: 'DELETE' })).status === 204) removed.views++;
}
for (const l of (await call(`${O}/labels`)).json.filter((x) => LABELS.includes(x.name) || x.name.startsWith('Layout label '))) {
  if ((await call(`${O}/labels/${l.id}`, { method: 'DELETE' })).status === 204) removed.labels.push(l.name);
}
if (project && !project.archived_at) {
  removed.project = `LAYT archived (${(await call(`${O}/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })).status})`;
}
// The planned release of the layout check (a released one cannot be deleted and stays; the layout check finds it again by name)
for (const r of (await call(`${O}/releases?page_size=100`)).json.items.filter((x) => x.name.startsWith('Layout planned release'))) {
  if ((await call(`${O}/releases/${r.id}`, { method: 'DELETE' })).status === 204) removed.releases = (removed.releases ?? 0) + 1;
}
console.log('removed:', JSON.stringify(removed));
// Files on the upload volume that no attachment row points to (a killed run, or bugs deleted with files in place): removed by the
// backend's maintenance command, run in the backend container (through WSL on the Windows build machine, D-001)
{
  const args = ['compose', 'exec', '-T', 'backend', 'python', '-m', 'app.maintenance', 'orphan-uploads'];
  const tries = process.platform === 'win32'
    ? [['wsl.exe', ['-d', process.env.QAP_WSL_DISTRO || 'Ubuntu', '--cd', `/mnt/${root[0].toLowerCase()}${root.slice(2).replace(/\\/g, '/')}`, '--exec', 'docker', ...args]]]
    : [['docker', args]];
  for (const [cmd, a] of tries) {
    const r = spawnSync(cmd, a, { encoding: 'utf8' });
    console.log(r.status === 0 ? `uploads: ${r.stdout.trim()}` : `uploads: could not run the maintenance command (${(r.stderr || r.error?.message || '').trim().split(/\r?\n/).pop()})`);
  }
}
console.log('live reset links at the end:', JSON.stringify(liveResetLinks([RESET_EMAIL])));
