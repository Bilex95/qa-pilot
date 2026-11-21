# Runs one Windows command while a single WSL session is held open, then closes the session (I-24, D-048).
#
# Why: WSL stops the distro, and the Docker Engine inside it, about 15 to 20 seconds after the last `wsl` call ends.
# Tools that run on Windows and talk to the stack (the layout check, Playwright) are not WSL sessions, so the stack can
# disappear in the middle of a run. This script keeps the distro up for exactly one task.
#
# The hold is allowed only here: scoped to the one command, closed in `finally` (also on failure and Ctrl+C), and capped
# at one hour by `timeout` even if the close fails. Free running keepalives are not allowed (docs/ENVIRONMENT.md).
#
# Usage (from any folder):
#   powershell -File scripts/with-wsl.ps1 node scripts/check-app-layout.mjs
# The exit code is the command's exit code. Set QAP_WSL_DISTRO to use another distro than Ubuntu.
# Add -Up before the command to bring the stack up first, inside the held session (the containers need about half a
# minute to come back after the distro was idle):
#   powershell -File scripts/with-wsl.ps1 -Up node scripts/check-app-layout.mjs
param([switch]$Up, [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Command)

$root = Split-Path -Parent $PSScriptRoot
$distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
$drive = $root.Substring(0, 1).ToLower()
$holdScript = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/') + '/scripts/wsl-hold.sh'
$holder = $null
$code = 1
try {
    $holder = Start-Process -FilePath 'wsl.exe' -WindowStyle Hidden -PassThru -ArgumentList @('-d', $distro, '--', 'bash', $holdScript)
    Start-Sleep -Seconds 3
    if ($holder.HasExited) { throw "The WSL hold session ended at once (exit $($holder.ExitCode)). Is the distro '$distro' installed?" }
    [Console]::Error.WriteLine("with-wsl: holding one WSL session (pid $($holder.Id)) while the command runs")

    if ($Up) {
        [Console]::Error.WriteLine('with-wsl: bringing the stack up (waits for the healthchecks)')
        & wsl.exe -d $distro --cd ($holdScript -replace '/scripts/wsl-hold\.sh$', '') -- sh scripts/dc.sh up -d --wait 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "The stack did not come up (exit $LASTEXITCODE). Run scripts/dc.ps1 up -d --wait to see why." }
        # `up --wait` can return while the database is still being restarted by the idle shutdown of the previous run: wait until the
        # API answers with the database ok three times in a row, two seconds apart (at most a minute), before the command starts
        $steady = 0
        for ($i = 0; $i -lt 30 -and $steady -lt 3; $i++) {
            try { $steady = if ((Invoke-RestMethod -Uri 'http://localhost:8000/api/v1/health' -TimeoutSec 5).db -eq 'ok') { $steady + 1 } else { 0 } } catch { $steady = 0 }
            if ($steady -lt 3) { Start-Sleep -Seconds 2 }
        }
        if ($steady -lt 3) { throw 'The API never reported the database as ok after the stack came up.' }
    }

    $exe = $Command[0]
    $rest = @($Command | Select-Object -Skip 1)  # @() keeps a single argument an array (splatting a string passes its characters)
    & $exe @rest
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
}
catch {
    [Console]::Error.WriteLine("with-wsl: $($_.Exception.Message)")
    $code = 1
}
finally {
    if ($holder -and -not $holder.HasExited) { Stop-Process -Id $holder.Id -Force -ErrorAction SilentlyContinue }
    # Make sure the Linux side is gone too
    & wsl.exe -d $distro -- bash $holdScript stop 2>$null | Out-Null
    [Console]::Error.WriteLine('with-wsl: WSL hold closed')
}
exit $code
