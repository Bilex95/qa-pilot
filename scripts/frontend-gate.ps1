# Runs scripts/frontend-gate.sh in WSL (lint, typecheck, build). Use it inside with-wsl.ps1 so Docker stays up:
#   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\frontend-gate.ps1 > <repo>\.gate\frontend-gate.txt 2>&1
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$script = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/') + '/scripts/frontend-gate.sh'
wsl.exe -d $distro --exec bash $script
exit $LASTEXITCODE
