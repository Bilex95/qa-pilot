# Audits the backend's pinned Python packages for known vulnerabilities (REQ-063). Use it inside with-wsl.ps1:
#   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\pip-audit.ps1
# pip-audit is installed into a throw away folder in the container, not into the image.
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$dir = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
wsl.exe -d $distro --cd $dir --exec docker compose exec -T backend sh -c "pip install -q --target /tmp/pa pip-audit && PYTHONPATH=/tmp/pa python -m pip_audit -r requirements.txt -r requirements-dev.txt"
exit $LASTEXITCODE
