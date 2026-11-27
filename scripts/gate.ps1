# The local gates in one command: frontend lint, typecheck and build, then the Python checks (ruff, mypy, pytest).
#   & <repo>\scripts\gate.ps1                  all gates in one held WSL session
#   & <repo>\scripts\gate.ps1 -Only frontend   or: -Only python   or: -Only newman (needs the baseline seed; not part of "all")
# Full output goes to <repo>\.gate\gate-frontend.txt and <repo>\.gate\gate-python.txt (Grep them for the summary
# and failure lines, do not read them whole). The console shows one PASS or FAIL line per part.
# Exit code: 0 when every part passed, 1 otherwise.
param([ValidateSet('all', 'frontend', 'python', 'newman')][string]$Only = 'all')

$root = Split-Path -Parent $PSScriptRoot
$gate = Join-Path $root '.gate'
New-Item -ItemType Directory -Force $gate | Out-Null

if (-not $env:QAP_GATE_INNER) {
    # Outer call: start one held WSL session (Docker stays up for the whole run) and run this script again inside it.
    # The choice travels in environment variables because with-wsl.ps1 passes its arguments as plain strings.
    $env:QAP_GATE_INNER = '1'
    $env:QAP_GATE_ONLY = $Only
    try {
        & (Join-Path $PSScriptRoot 'with-wsl.ps1') -Up (Join-Path $PSScriptRoot 'gate.ps1')
        $code = $LASTEXITCODE
    }
    finally {
        $env:QAP_GATE_INNER = $null
        $env:QAP_GATE_ONLY = $null
    }
    exit $code
}

$only = if ($env:QAP_GATE_ONLY) { $env:QAP_GATE_ONLY } else { 'all' }
$failed = 0

# Tests run on the mock AI provider, .env untouched (D-086). The guard in py-checks.sh and newman.sh refuses to run otherwise; this
# prints the one line that proves which case it was.
function Show-AiLine([string]$File) {
    if (Select-String -Path $File -Pattern 'AI guard FAILED' -Quiet) { 'AI: guard FAILED, the backend was not on the mock provider, nothing was run' }
    elseif (Select-String -Path $File -Pattern 'AI: mock \(test mode' -Quiet) { 'AI: mock (test mode, .env untouched)' }
}

if ($only -eq 'all' -or $only -eq 'frontend') {
    & (Join-Path $PSScriptRoot 'frontend-gate.ps1') > (Join-Path $gate 'gate-frontend.txt') 2>&1
    $c = $LASTEXITCODE
    if ($c -ne 0) { $failed = 1 }
    "frontend (lint, typecheck, build): " + $(if ($c -eq 0) { 'PASS' } else { "FAIL (exit $c), see .gate\gate-frontend.txt" })
}
if ($only -eq 'all' -or $only -eq 'python') {
    & (Join-Path $PSScriptRoot 'py-checks.ps1') > (Join-Path $gate 'gate-python.txt') 2>&1
    $c = $LASTEXITCODE
    if ($c -ne 0) { $failed = 1 }
    "python (ruff, mypy, pytest): " + $(if ($c -eq 0) { 'PASS' } else { "FAIL (exit $c), see .gate\gate-python.txt" })
    Show-AiLine (Join-Path $gate 'gate-python.txt')
}
if ($only -eq 'newman') {
    # Needs the baseline seed. newman.sh puts the backend on the mock for the run and restores it (D-086).
    & (Join-Path $PSScriptRoot 'newman.ps1') > (Join-Path $gate 'gate-newman.txt') 2>&1
    $c = $LASTEXITCODE
    if ($c -ne 0) { $failed = 1 }
    "newman: " + $(if ($c -eq 0) { 'PASS' } else { "FAIL (exit $c), see .gate\gate-newman.txt" })
    Show-AiLine (Join-Path $gate 'gate-newman.txt')
}
exit $failed
