// Test helper: ends the password reset links that a test script created, so no live link for a real or seeded account is left behind.
//
// The API has no "revoke a reset link" endpoint (a link ends when it is used, after one hour, or when a newer link replaces it), and a
// newer link would itself be live. So this sets `revoked_at` on the person's unused links through the database container, which is
// exactly what the backend does when it replaces a link. The database user and name come from the container's own environment:
// no secret is written here. Local and test use only, like the seed CLI.
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function psql(sql) {
  const inner = 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -v ON_ERROR_STOP=1';
  const exec = ['compose', 'exec', '-T', 'db', 'sh', '-c', inner];
  if (process.platform === 'win32') {
    const wslRoot = `/mnt/${root[0].toLowerCase()}${root.slice(2).replace(/\\/g, '/')}`; // C:\Users\x\qa-pilot -> /mnt/c/Users/x/qa-pilot
    // --exec: no shell on the WSL side, so $POSTGRES_USER reaches the container's own shell unexpanded
    return execFileSync('wsl', ['-d', 'Ubuntu', '--cd', wslRoot, '--exec', 'docker', ...exec], { input: sql, encoding: 'utf8' });
  }
  return execFileSync('docker', exec, { cwd: root, input: sql, encoding: 'utf8' });
}

function emailList(emails) {
  for (const e of emails) if (!/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(e)) throw new Error(`not a plain email address: ${e}`);
  return `array[${emails.map((e) => `'${e}'`).join(',')}]`;
}

const LIVE = 'used_at is null and revoked_at is null and expires_at > now()';
const LIVE_R = 'r.used_at is null and r.revoked_at is null and r.expires_at > now()'; // the same condition for the aliased join below

/** How many unused, unexpired reset links these people have, as { email: count }. */
export function liveResetLinks(emails) {
  const out = psql(`select u.email, count(r.id) from users u left join password_resets r on r.user_id = u.id and ${LIVE_R} `
    + `where lower(u.email) = any(${emailList(emails)}) group by u.email;`);
  const counts = Object.fromEntries(emails.map((e) => [e, 0]));
  for (const line of out.split(/\r?\n/).filter(Boolean)) { const [email, n] = line.split('|'); counts[email.toLowerCase()] = Number(n); }
  return counts;
}

/** Revokes every live reset link of these people. Returns { before, revoked, after } and throws if any link is still live. */
export function revokeResetLinks(emails) {
  const before = liveResetLinks(emails);
  const out = psql(`update password_resets set revoked_at = now() where ${LIVE} and user_id in `
    + `(select id from users where lower(email) = any(${emailList(emails)})) returning id;`);
  const revoked = out.split(/\r?\n/).filter((line) => line && !line.startsWith('UPDATE ')).length; // psql also prints an "UPDATE n" status line
  const after = liveResetLinks(emails);
  const still = Object.entries(after).filter(([, n]) => n > 0);
  if (still.length) throw new Error(`reset links are still live for: ${still.map(([e]) => e).join(', ')}`);
  return { before, revoked, after };
}
