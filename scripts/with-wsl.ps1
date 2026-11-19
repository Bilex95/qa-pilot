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
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Command)

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
