// D-055: the pages that handle a secret link must send Referrer-Policy: no-referrer and Cache-Control: no-store.
// Usage (from e2e/, stack up): node scripts/check-secret-page-headers.mjs [baseUrl]
const base = process.argv[2] || 'http://localhost:3000';
let failed = 0;
for (const path of ['/invite', '/reset-password', '/forgot-password']) {
  const res = await fetch(`${base}${path}`, { redirect: 'manual' });
  const referrer = res.headers.get('referrer-policy');
  const cache = res.headers.get('cache-control');
  const ok = referrer === 'no-referrer' && (cache ?? '').includes('no-store');
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${path}: status ${res.status}, Referrer-Policy=${referrer}, Cache-Control=${cache}`);
}
// A normal page keeps the general policy, so the rule is not applied everywhere by accident
const login = await fetch(`${base}/login`);
const general = login.headers.get('referrer-policy');
console.log(`info /login: Referrer-Policy=${general}`);
if (failed) { console.log(`FAIL: ${failed} page(s) without the secret page headers`); process.exit(1); }
console.log('PASS: invite, reset and forgot password pages send no-referrer and no-store');
