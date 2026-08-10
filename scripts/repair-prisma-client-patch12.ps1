$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$schemaPath = Join-Path $projectRoot 'prisma\schema.prisma'

Write-Host '=== KIEM TRA SCHEMA PRISMA ===' -ForegroundColor Cyan
if (-not (Test-Path $schemaPath)) {
    throw "Khong tim thay schema: $schemaPath"
}

$schemaText = Get-Content $schemaPath -Raw
$requiredTokens = @(
    'model certification_application_sites',
    'other_certification_type',
    'review_items_json',
    'proposed_auditor',
    'sites                  certification_application_sites[]'
)

foreach ($token in $requiredTokens) {
    if (-not $schemaText.Contains($token)) {
        throw "Schema chua duoc cap nhat. Thieu: $token"
    }
}

Write-Host 'Schema dung ban Patch 12.' -ForegroundColor Green

Write-Host '=== XOA PRISMA CLIENT CU VA DIST ===' -ForegroundColor Cyan
if (Test-Path 'node_modules\.prisma') {
    Remove-Item 'node_modules\.prisma' -Recurse -Force
}
if (Test-Path 'dist') {
    Remove-Item 'dist' -Recurse -Force
}

Write-Host '=== PRISMA VALIDATE ===' -ForegroundColor Cyan
& npx.cmd prisma validate --schema "$schemaPath"
if ($LASTEXITCODE -ne 0) {
    throw 'prisma validate that bai.'
}

Write-Host '=== PRISMA GENERATE ===' -ForegroundColor Cyan
& npx.cmd prisma generate --schema "$schemaPath"
if ($LASTEXITCODE -ne 0) {
    throw 'prisma generate that bai.'
}

$clientTypes = Join-Path $projectRoot 'node_modules\.prisma\client\index.d.ts'
if (-not (Test-Path $clientTypes)) {
    throw 'Khong tim thay Prisma Client sau khi generate.'
}

$clientText = Get-Content $clientTypes -Raw
$clientRequired = @(
    'certification_application_sites',
    'other_certification_type',
    'review_items_json',
    'proposed_auditor'
)
foreach ($token in $clientRequired) {
    if (-not $clientText.Contains($token)) {
        throw "Prisma Client van cu. Thieu: $token"
    }
}

Write-Host 'Prisma Client da cap nhat dung.' -ForegroundColor Green

Write-Host '=== BUILD BACKEND ===' -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    throw 'npm run build that bai.'
}

Write-Host ''
Write-Host 'HOAN TAT: Prisma Client va backend da build thanh cong.' -ForegroundColor Green
