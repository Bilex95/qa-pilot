# Runs "docker compose <args>" from the repo root.
# Uses Docker on the Windows PATH when present (Docker Desktop); otherwise the Docker Engine inside WSL Ubuntu (D-001).
# For `up` it first checks that the host ports the stack needs are not owned by something else (I-24, D-048):
# a port of this same project (qa-pilot) is fine, anything else is refused with the owner named and nothing started.
# Set QAP_SKIP_PREFLIGHT=1 to skip the check.
# Examples:
#   powershell -File scripts/dc.ps1 up -d --build
#   powershell -File scripts/dc.ps1 ps
#   powershell -File scripts/dc.ps1 exec backend pytest -q
#   powershell -File scripts/dc.ps1 down
# Plain equivalent anywhere Docker is on the PATH: docker compose <args> (or sh scripts/dc.sh <args> for the check)
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$wslPath = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
$hasDocker = [bool](Get-Command docker -ErrorAction SilentlyContinue)

# Ports of this stack: 3000, 8000 and the database host port (DB_HOST_PORT in .env, default 5433)
function Get-StackPorts {
    $db = 5433
    $envFile = Join-Path $root '.env'
    if (Test-Path $envFile) {
        $line = Select-String -Path $envFile -Pattern '^DB_HOST_PORT=(\d+)' | Select-Object -Last 1
        if ($line) { $db = [int]$line.Matches[0].Groups[1].Value }
    }
    return @(3000, 8000, $db)
}

# Windows side: a program that is not part of WSL or Docker is listening on one of the ports
function Test-WindowsPorts {
    $relay = '^(wslrelay|wslhost|wslservice|vmmem.*|System|Idle|com\.docker\..*|Docker Desktop.*)$'
    $refused = @()
    foreach ($port in Get-StackPorts) {
        $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $c) { continue }
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        $name = if ($p) { $p.ProcessName } else { 'unknown' }
        if ($name -notmatch $relay) { $refused += "  port $port is in use by $name (pid $($c.OwningProcess)) on Windows" }
    }
    if ($refused.Count -gt 0) {
        [Console]::Error.WriteLine("Refusing to start: the stack needs ports it cannot have.`n" + ($refused -join "`n"))
        [Console]::Error.WriteLine('Nothing was started. Stop that program, or change DB_HOST_PORT in .env for the database, then run up again.')
        return $false
    }
    return $true
}

if ($args.Count -gt 0 -and $args[0] -eq 'up' -and $env:QAP_SKIP_PREFLIGHT -ne '1') {
    if (-not (Test-WindowsPorts)) { exit 1 }
    if ($hasDocker) {
        $sh = Get-Command sh -ErrorAction SilentlyContinue
        if ($sh) { & sh (Join-Path $root 'scripts/dc-preflight.sh'); if ($LASTEXITCODE -ne 0) { exit 1 } }
    } else {
        & wsl -d $distro --cd $wslPath -- sh scripts/dc-preflight.sh
        if ($LASTEXITCODE -ne 0) { exit 1 }
    }
}

if ($hasDocker) {
    Push-Location $root
    try { & docker compose @args; $code = $LASTEXITCODE } finally { Pop-Location }
    exit $code
}
& wsl -d $distro --cd $wslPath -- docker compose @args
exit $LASTEXITCODE
