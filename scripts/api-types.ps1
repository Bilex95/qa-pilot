# Regenerates frontend/openapi.json and the TypeScript types (scripts/api-types.sh) inside WSL:
#   powershell -File scripts/with-wsl.ps1 -Up powershell -File scripts/api-types.ps1
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$script = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/') + '/scripts/api-types.sh'
wsl.exe -d $distro --exec sh $script
exit $LASTEXITCODE
