# Runs a few backend tests in the running backend container, without the captured log noise. Use it inside with-wsl.ps1:
#   & C:\Users\HP\qa-pilot\scripts\with-wsl.ps1 -Up C:\Users\HP\qa-pilot\scripts\py-test.ps1 app/modules/bugs/tests/test_activity_api.py -k labels
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PytestArgs)
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$dir = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
wsl.exe -d $distro --cd $dir --exec docker compose exec -T backend pytest -q --show-capture=no --tb=short @PytestArgs
exit $LASTEXITCODE
