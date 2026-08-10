$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$schemaPath = Join-Path $projectRoot 'prisma\schema.prisma'

Write-Host '=== KIEM TRA PRISMA SCHEMA PATCH 17 ===' -ForegroundColor Cyan
if (-not (Test-Path $schemaPath)) {
    throw "Khong tim thay schema: $schemaPath"
}

$schemaText = Get-Content $schemaPath -Raw
$requiredSchemaTokens = @(
    'proposed_auditors_json',
    'ims_integration_criteria_json',
    'ims_integration_percent',
    'combined_audit_capability_percent'
)

foreach ($token in $requiredSchemaTokens) {
    if (-not $schemaText.Contains($token)) {
        throw "Schema chua dung Patch 17. Thieu: $token"
    }
}

Write-Host 'Schema Patch 17 hop le.' -ForegroundColor Green

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
$requiredClientTokens = @(
    'proposed_auditors_json',
    'ims_integration_criteria_json',
    'combined_audit_capability_percent'
)

foreach ($token in $requiredClientTokens) {
    if (-not $clientText.Contains($token)) {
        throw "Prisma Client van la ban cu. Thieu: $token"
    }
}

Write-Host 'Prisma Client da nhan du cac truong Patch 17.' -ForegroundColor Green

Write-Host '=== BUILD BACKEND ===' -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    throw 'npm run build that bai.'
}

Write-Host ''
Write-Host 'HOAN TAT: Prisma Client va backend da build thanh cong.' -ForegroundColor Green
