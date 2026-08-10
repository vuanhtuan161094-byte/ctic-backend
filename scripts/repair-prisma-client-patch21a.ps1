$ErrorActionPreference = "Stop"

Write-Host "[1/6] Kiem tra Patch 21A..." -ForegroundColor Cyan
$schemaPath = ".\prisma\schema.prisma"
$servicePath = ".\src\application-reviews\application-reviews.service.ts"
$dtoPath = ".\src\application-reviews\dto\create-application-review.dto.ts"

$schema = Get-Content -Raw -Path $schemaPath
$service = Get-Content -Raw -Path $servicePath
$dto = Get-Content -Raw -Path $dtoPath

$requiredSchemaFields = @(
    "industry_scopes_json",
    "proposed_auditors_json",
    "ims_integration_criteria_json",
    "ims_integration_percent",
    "combined_audit_capability_percent"
)

foreach ($field in $requiredSchemaFields) {
    if ($schema -notmatch [regex]::Escape($field)) {
        throw "schema.prisma thieu field: $field"
    }
}

if ($service -notmatch "NormalizedIndustryScope") {
    throw "application-reviews.service.ts chua dung ban hop nhat Patch 21A"
}

if ($dto -notmatch "industry_scopes") {
    throw "CreateApplicationReviewDto chua cho phep industry_scopes"
}

Write-Host "[2/6] Dung cac tien trinh backend cu neu dang khoa Prisma Client..." -ForegroundColor Cyan
Write-Host "Neu buoc xoa file bi Access denied, hay Ctrl+C tat backend roi chay lai script." -ForegroundColor Yellow

Write-Host "[3/6] Xoa Prisma Client va dist cu..." -ForegroundColor Cyan
Remove-Item -Recurse -Force ".\node_modules\.prisma" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\dist" -ErrorAction SilentlyContinue

Write-Host "[4/6] Validate Prisma schema..." -ForegroundColor Cyan
npx prisma validate
if ($LASTEXITCODE -ne 0) { throw "prisma validate that bai" }

Write-Host "[5/6] Generate Prisma Client..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate that bai" }

$generatedFiles = Get-ChildItem ".\node_modules\.prisma\client" -Recurse -File -ErrorAction SilentlyContinue
foreach ($field in $requiredSchemaFields) {
    $found = $generatedFiles | Select-String -Pattern $field -Quiet
    if (-not $found) {
        throw "Prisma Client sau khi generate van thieu field: $field"
    }
}

Write-Host "[6/6] Build backend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "backend build that bai" }

Write-Host "HOAN TAT: Patch 21A da sua DTO industry_scopes, dong bo Prisma Client va build backend thanh cong." -ForegroundColor Green
