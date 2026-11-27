# Runs Newman inside WSL as one session (see scripts/newman.sh, I-24). Usage: powershell -File scripts/newman.ps1
$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$wslPath = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $sh = Get-Command sh -ErrorAction SilentlyContinue
    if (-not $sh) { [Console]::Error.WriteLine('newman.ps1: Docker is on the Windows PATH but sh is not; run sh scripts/newman.sh from a POSIX shell.'); exit 2 }
    Push-Location $root
    try { & sh scripts/newman.sh; exit $LASTEXITCODE } finally { Pop-Location }
}
& wsl -d $distro --cd $wslPath -- sh scripts/newman.sh
exit $LASTEXITCODE
