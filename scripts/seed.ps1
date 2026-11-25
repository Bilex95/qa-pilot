# Runs the seed CLI in the running backend container. Use it inside with-wsl.ps1:
#   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\seed.ps1 --scenario baseline
#   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\seed.ps1 --manifest
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$SeedArgs)
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$dir = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
wsl.exe -d $distro --cd $dir --exec docker compose exec -T backend python -m app.seed @SeedArgs
exit $LASTEXITCODE
