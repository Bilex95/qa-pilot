# The full responsive layout check, run the light way (CLAUDE.md, Part 3): shut WSL down to free memory, let with-wsl.ps1 bring
# the containers back up, and run nothing else meanwhile. Screenshots go to e2e/parity/stage4/<Name>.
#   & C:\Users\HP\qa-pilot\scripts\layout-check.ps1 -Name i11 > C:\Users\HP\qa-pilot\.gate\layout-i11.txt 2>&1
# Add -Only 1440 to run a single viewport label while debugging. The exit code is the check's.
param([Parameter(Mandatory = $true)][string]$Name, [string]$Only = '', [int]$Batch = 3)

$root = Split-Path -Parent $PSScriptRoot
$shots = Join-Path $root "e2e\parity\stage4\$Name"
New-Item -ItemType Directory -Force $shots | Out-Null
& wsl.exe --shutdown
Start-Sleep -Seconds 5
$os = Get-CimInstance Win32_OperatingSystem
[Console]::Error.WriteLine(('layout-check: free memory {0:N1} GB of {1:N1} GB' -f ($os.FreePhysicalMemory / 1MB), ($os.TotalVisibleMemorySize / 1MB)))
$check = Join-Path $root 'e2e\scripts\check-app-layout.mjs'
$extra = @('--batch', "$Batch")  # widths per browser: the retry after a memory kill uses -Batch 1
if ($Only) { $extra += @('--only', $Only) }
& (Join-Path $PSScriptRoot 'with-wsl.ps1') -Up node $check --shots $shots @extra
exit $LASTEXITCODE
