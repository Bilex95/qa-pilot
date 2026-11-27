# I-24 evidence: does the Docker Engine in WSL stop when no WSL session is open, and does scripts/with-wsl.ps1 prevent it?
#   powershell -File scripts/repro-i24-idle.ps1            control: no WSL session during the wait
#   powershell -File scripts/repro-i24-idle.ps1 -Hold      the same wait inside scripts/with-wsl.ps1
# WARNING: the control run stops the local stack (db, backend, frontend) for a short while, because it is the same Docker
# Engine. Run `powershell -File scripts/dc.ps1 up -d --wait` afterwards. No data is lost (named volumes).
param([switch]$Hold, [int]$WaitSeconds = 45)

$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$wslPath = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')

function Invoke-Wsl([string]$script) { & wsl.exe -d $distro --cd $wslPath -- bash $script }

# 1. Make sure the stack is up, in one WSL session, and take the start time inside WSL (same clock as the journal)
Invoke-Wsl 'scripts/repro-i24-idle.sh' | Out-Null
$t0 = (& wsl.exe -d $distro -- date '+%Y-%m-%d %H:%M:%S') | Select-Object -First 1
"mode: $(if ($Hold) { 'held (with-wsl.ps1)' } else { 'control (no WSL session)' }); wait: $WaitSeconds s; start: $t0"

# 2. Wait with or without a WSL session open (all WSL calls above have ended). The elapsed time is printed so a wait
#    that did not happen cannot pass unnoticed.
$clock = [System.Diagnostics.Stopwatch]::StartNew()
if ($Hold) {
    # one argument per word, none starting with a dash (PowerShell would read it as a parameter of with-wsl.ps1)
    & (Join-Path $PSScriptRoot 'with-wsl.ps1') cmd /c "ping 127.0.0.1 -n $($WaitSeconds + 1) > nul"
    if ($LASTEXITCODE -ne 0) { "with-wsl.ps1 failed (exit $LASTEXITCODE): the held wait did not run"; exit 1 }
} else {
    Start-Sleep -Seconds $WaitSeconds
}
"waited $([math]::Round($clock.Elapsed.TotalSeconds)) s"

# 3. Read the journal for docker.service stops since the start time
$env:QAP_IDLE_SINCE = $t0
& wsl.exe -d $distro --cd $wslPath -- bash scripts/repro-i24-idle.sh report $t0
