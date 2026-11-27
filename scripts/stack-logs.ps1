# Prints the last lines of a service log of the running stack (default: backend). Use it inside with-wsl.ps1 so Docker stays up:
#   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\stack-logs.ps1 backend 60
param([string]$Service = 'backend', [int]$Lines = 60)
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$dir = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
wsl.exe -d $distro --cd $dir --exec docker compose logs --no-color --tail $Lines $Service
exit $LASTEXITCODE
