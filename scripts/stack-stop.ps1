# Stops the containers and keeps their data (docker compose stop, never down -v).
#   & <repo>\scripts\stack-stop.ps1
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$dir = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
wsl.exe -d $distro --cd $dir --exec docker compose stop
exit $LASTEXITCODE
