$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

Write-Host 'Patch 35A.4.5 installer is deprecated.' -ForegroundColor Yellow
Write-Host 'Routing to the current safe commercial stabilizer (36C.1a).' -ForegroundColor Yellow
Write-Host 'The new flow never grants db_owner.' -ForegroundColor Yellow

& powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\stabilize-windows-patch36c1a.ps1'
exit $LASTEXITCODE
