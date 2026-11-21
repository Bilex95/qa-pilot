# Migration round trip on the development database: downgrade one step, upgrade to head, then `alembic check` (no drift).
# Use it inside with-wsl.ps1 so Docker stays up:
#   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\migration-check.ps1 0010
param([Parameter(Mandatory = $true)][string]$Previous)
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$dir = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
foreach ($step in @(@('downgrade', $Previous), @('upgrade', 'head'), @('check'), @('current'))) {
    Write-Output ("alembic " + ($step -join ' '))
    wsl.exe -d $distro --cd $dir --exec docker compose exec -T backend alembic @step
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
