$ErrorActionPreference = "Stop"

Write-Host "[1/6] Kiem tra Patch 22..." -ForegroundColor Cyan
$schemaPath = ".\prisma\schema.prisma"
$schema = Get-Content -Raw -Path $schemaPath
$requiredSchemaTokens = @(
    "workflow_status",
    "prepared_by_id",
    "checker_id",
    "approver_id",
    "application_review_actions"
)
foreach ($token in $requiredSchemaTokens) {
    if ($schema -notmatch [regex]::Escape($token)) {
        throw "schema.prisma thieu: $token"
    }
}

$service = Get-Content -Raw -Path ".\src\application-reviews\application-reviews.service.ts"
if ($service -notmatch "PENDING_APPROVAL" -or $service -notmatch "findAssignees") {
    throw "application-reviews.service.ts chua dung ban Patch 22"
}

Write-Host "[2/6] Xoa Prisma Client va dist cu..." -ForegroundColor Cyan
Write-Host "Neu bi Access denied, Ctrl+C tat backend roi chay lai." -ForegroundColor Yellow
Remove-Item -Recurse -Force ".\node_modules\.prisma" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\dist" -ErrorAction SilentlyContinue

Write-Host "[3/6] Validate Prisma schema..." -ForegroundColor Cyan
npx prisma validate
if ($LASTEXITCODE -ne 0) { throw "prisma validate that bai" }

Write-Host "[4/6] Generate Prisma Client..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate that bai" }

Write-Host "[5/6] Kiem tra Prisma Client moi..." -ForegroundColor Cyan
$generatedFiles = Get-ChildItem ".\node_modules\.prisma\client" -Recurse -File -ErrorAction SilentlyContinue
foreach ($token in $requiredSchemaTokens) {
    $found = $generatedFiles | Select-String -Pattern $token -Quiet
    if (-not $found) {
        throw "Prisma Client sau generate van thieu: $token"
    }
}

Write-Host "[6/6] Build backend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "backend build that bai" }

Write-Host "HOAN TAT: Patch 22 da dong bo quy trinh xem xet 2 cap va build backend thanh cong." -ForegroundColor Green
