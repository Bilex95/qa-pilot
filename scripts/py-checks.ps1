# Runs scripts/py-checks.sh in WSL (ruff, mypy, pytest). Use it inside with-wsl.ps1 so Docker stays up:
#   powershell -File scripts/with-wsl.ps1 -Up powershell -File scripts/py-checks.ps1
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$script = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/') + '/scripts/py-checks.sh'
wsl.exe -d $distro --exec bash $script
exit $LASTEXITCODE
