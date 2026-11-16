# Validates the Stage 2 design deliverables in one command (D-035).
#   1. requirement traceability (docs)
#   2. prototype checks: script errors, role rules, layout at 320 to 1440 px
#      (fails if any element is wider than the screen), tap targets, axe
#   3. screenshot files: present, non empty, decodable (playbook validator)
# Usage from the repo root:  powershell -ExecutionPolicy Bypass -File scripts/validate-design.ps1
# Plain equivalents:
#   python scripts/check_traceability.py
#   cd e2e; node scripts/check-prototype.mjs; cd ..
#   python .claude/skills/project-delivery/scripts/validate_design_assets.py design
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$failed = $false

Write-Host '== Traceability'
python scripts/check_traceability.py
if ($LASTEXITCODE -ne 0) { $failed = $true }

Write-Host '== Prototype (roles, layout at 320 to 1440 px, tap targets, axe)'
Push-Location e2e
node scripts/check-prototype.mjs
if ($LASTEXITCODE -ne 0) { $failed = $true }
Pop-Location

Write-Host '== Screenshot files'
python .claude/skills/project-delivery/scripts/validate_design_assets.py design
if ($LASTEXITCODE -ne 0) { $failed = $true }

if ($failed) { Write-Host 'DESIGN VALIDATION FAILED'; exit 1 }
Write-Host 'DESIGN VALIDATION PASSED'
