$ErrorActionPreference = "Stop"

Write-Host "[1/5] Kiem tra file Patch 20A..." -ForegroundColor Cyan
$schema = Get-Content -Raw -Path ".\prisma\schema.prisma"
$service = Get-Content -Raw -Path ".\src\application-reviews\application-reviews.service.ts"
if ($schema -notmatch "industry_scopes_json") {
    throw "schema.prisma chua co field industry_scopes_json"
}
if ($service -notmatch "NormalizedIndustryScope") {
    throw "application-reviews.service.ts chua phai ban Patch 20A"
}

Write-Host "[2/5] Xoa Prisma Client va dist cu..." -ForegroundColor Cyan
Remove-Item -Recurse -Force ".\node_modules\.prisma" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\dist" -ErrorAction SilentlyContinue

Write-Host "[3/5] Validate Prisma schema..." -ForegroundColor Cyan
npx prisma validate
if ($LASTEXITCODE -ne 0) { throw "prisma validate that bai" }

Write-Host "[4/5] Generate Prisma Client..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate that bai" }

$generated = Get-ChildItem ".\node_modules\.prisma\client" -Recurse -File -ErrorAction SilentlyContinue |
    Select-String -Pattern "industry_scopes_json" -Quiet
if (-not $generated) {
    throw "Prisma Client sau khi generate van chua co industry_scopes_json"
}

Write-Host "[5/5] Build backend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "backend build that bai" }

Write-Host "HOAN TAT: Patch 20A da dong bo Prisma Client va build backend thanh cong." -ForegroundColor Green
