@echo off
setlocal
cd /d "%~dp0\.."

echo ============================================================
echo PATCH 35A.4.3 - BASELINE PRISMA CHO DATABASE HIEN CO
echo ============================================================
echo.
echo Hay dung backend dang chay bang Ctrl+C truoc khi tiep tuc.
echo Patch KHONG xoa bang, KHONG xoa du lieu va KHONG reset database.
echo.

echo [1/10] Dong bo provider cua migration_lock.toml...
node .\scripts\normalize-prisma-migration-provider-patch35a42.cjs
if errorlevel 1 goto :error

echo [2/10] Kiem tra Prisma schema...
call npx prisma validate
if errorlevel 1 goto :error

echo [3/10] Tao lai Prisma Client...
call npx prisma generate
if errorlevel 1 goto :error

echo [4/10] Kiem tra model Prisma Patch 35A.4...
node .\scripts\verify-prisma-client-patch35a4.cjs
if errorlevel 1 goto :error

echo [5/10] Kiem tra va baseline database hien co neu can...
node .\scripts\baseline-existing-database-patch35a43.cjs
if errorlevel 1 goto :error

echo [6/10] Ap dung migration con thieu...
call npx prisma migrate deploy
if errorlevel 1 goto :error

echo [7/10] Kiem tra trang thai migration...
call npx prisma migrate status
if errorlevel 1 goto :error

echo [8/10] Tao lai Prisma Client sau migration...
call npx prisma generate
if errorlevel 1 goto :error

echo [9/10] Build backend...
call npm run build
if errorlevel 1 goto :error

echo [10/10] Chay regression baseline...
node .\scripts\tests\prisma-baseline-regression-patch35a43.mjs
if errorlevel 1 goto :error

echo.
echo ============================================================
echo PATCH 35A.4.3 DA CAI DAT THANH CONG
echo Chay backend: npm run start:dev
echo ============================================================
exit /b 0

:error
echo.
echo ============================================================
echo PATCH 35A.4.3 DUNG VI CO LOI. GUI TOAN BO LOI PHIA TREN.
echo ============================================================
exit /b 1
