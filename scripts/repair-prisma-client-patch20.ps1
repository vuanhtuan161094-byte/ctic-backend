$ErrorActionPreference = "Stop"

Write-Host "[1/4] Kiem tra Prisma schema Patch 20..." -ForegroundColor Cyan
$schema = Get-Content -Raw -Path ".\prisma\schema.prisma"
if ($schema -notmatch "industry_scopes_json") {
    throw "schema.prisma chua co field industry_scopes_json"
}

Write-Host "[2/4] Xoa Prisma Client va dist cu..." -ForegroundColor Cyan
Remove-Item -Recurse -Force ".\node_modules\.prisma" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\dist" -ErrorAction SilentlyContinue

Write-Host "[3/4] Validate va generate Prisma Client..." -ForegroundColor Cyan
npx prisma validate
if ($LASTEXITCODE -ne 0) { throw "prisma validate that bai" }
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate that bai" }

Write-Host "[4/4] Build backend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "backend build that bai" }

Write-Host "HOAN TAT: Patch 20 da dong bo Prisma Client va build backend thanh cong." -ForegroundColor Green
