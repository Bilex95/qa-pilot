# Runs the login smoke, the sign out check and every screen flow of the CI job one after the other, and prints one line per script.
# A failing script does not stop the others. Use it inside with-wsl.ps1 with the baseline seeded:
#   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\run-flows.ps1 > C:\Users\HP\qa-pilot\.gate\flows-all.txt
# Pass script names (without .mjs) to run only those.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Only)

$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'e2e')
$all = @('smoke-login', 'check-signout', 'check-bugs-flow', 'check-tests-flow', 'check-board-flow', 'check-bug-detail-flow',
  'check-runs-flow', 'check-releases-flow', 'check-dashboard-flow', 'check-settings-flow', 'check-members-flow', 'check-reset-flow')
$names = if ($Only -and $Only.Count) { $Only } else { $all }
$failed = @()
# The dev server compiles a route on its first visit (minutes when the cache was cleared): visit each route once before the checks
foreach ($p in @('/login', '/register', '/o/lumen/dashboard', '/o/lumen/bugs', '/o/lumen/bugs/new', '/o/lumen/bugs/WEB-1', '/o/lumen/board', '/o/lumen/tests',
    '/o/lumen/tests/cases/new', '/o/lumen/runs', '/o/lumen/runs/R-1', '/o/lumen/releases', '/o/lumen/releases/00000000-0000-4000-8000-000000000000',
    '/o/lumen/reports', '/o/lumen/settings', '/o/lumen/members')) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 300 -Uri "http://localhost:3000$p" | Out-Null } catch { }
}
foreach ($name in $names) {
  Write-Output "== $name"
  & node (Join-Path $root "e2e\scripts\$name.mjs")
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  if ($code -ne 0) { $failed += $name; Write-Output "== $name FAILED ($code)" } else { Write-Output "== $name ok" }
}
Write-Output ('SUMMARY: ' + $(if ($failed.Count) { 'failed: ' + ($failed -join ', ') } else { 'all passed' }))
exit $failed.Count
