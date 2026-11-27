# Runs one script from e2e/scripts with e2e/ as the working directory, so callers need no cd.
#   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\e2e.ps1 check-settings-flow.mjs [args]
# The first argument is the file name inside e2e/scripts; the rest is passed on to node. The exit code is node's.
param([Parameter(Mandatory = $true, Position = 0)][string]$Script, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest)

$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'e2e')
$file = Join-Path $root (Join-Path 'e2e\scripts' $Script)
if (-not (Test-Path $file)) { [Console]::Error.WriteLine("e2e.ps1: no such script: $file"); exit 2 }
& node $file @Rest
$code = $LASTEXITCODE
if ($null -eq $code) { $code = 0 }
exit $code
