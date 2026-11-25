# The local gates in one command: frontend lint, typecheck and build, then the Python checks (ruff, mypy, pytest).
#   & <repo>\scripts\gate.ps1                  all gates in one held WSL session
#   & <repo>\scripts\gate.ps1 -Only frontend   or: -Only python
# Full output goes to <repo>\.gate\gate-frontend.txt and <repo>\.gate\gate-python.txt (Grep them for the summary
# and failure lines, do not read them whole). The console shows one PASS or FAIL line per part.
# Exit code: 0 when every part passed, 1 otherwise.
param([ValidateSet('all', 'frontend', 'python')][string]$Only = 'all')

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
}
exit $failed
