# Runs "docker compose <args>" from the repo root.
# Uses Docker on the Windows PATH when present (Docker Desktop); otherwise the Docker Engine inside WSL Ubuntu (D-001).
# Examples:
#   powershell -File scripts/dc.ps1 up -d --build
#   powershell -File scripts/dc.ps1 ps
#   powershell -File scripts/dc.ps1 exec backend pytest -q
#   powershell -File scripts/dc.ps1 down
# Plain equivalent anywhere Docker is on the PATH: docker compose <args>
$root = Split-Path -Parent $PSScriptRoot
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Push-Location $root
    try { & docker compose @args; $code = $LASTEXITCODE } finally { Pop-Location }
    exit $code
}
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$wslPath = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
& wsl -d $distro --cd $wslPath -- docker compose @args
exit $LASTEXITCODE
