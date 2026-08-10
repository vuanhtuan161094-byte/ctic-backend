@echo off
setlocal
cd /d "%~dp0\.."

echo ============================================================
echo PATCH 35A.4.2 - SUA PRISMA MIGRATION PROVIDER P3019
echo ============================================================
echo.
echo Hay dung backend dang chay bang Ctrl+C truoc khi tiep tuc.
echo Patch KHONG xoa migration va KHONG xoa du lieu.
echo.

echo [1/7] Dong bo provider cua migration_lock.toml...
node .\scripts\normalize-prisma-migration-provider-patch35a42.cjs
if errorlevel 1 goto :error

echo [2/7] Kiem tra Prisma schema...
call npx prisma validate
if errorlevel 1 goto :error

echo [3/7] Tao lai Prisma Client...
call npx prisma generate
if errorlevel 1 goto :error

echo [4/7] Kiem tra model Prisma Patch 35A.4...
node .\scripts\verify-prisma-client-patch35a4.cjs
if errorlevel 1 goto :error

echo [5/7] Ap dung migration con thieu...
call npx prisma migrate deploy
if errorlevel 1 goto :error

echo [6/7] Build backend...
call npm run build
if errorlevel 1 goto :error

echo [7/7] Chay regression provider...
node .\scripts\tests\prisma-provider-regression-patch35a42.mjs
if errorlevel 1 goto :error

echo.
echo ============================================================
echo PATCH 35A.4.2 DA CAI DAT THANH CONG
echo Chay backend: npm run start:dev
echo ============================================================
exit /b 0

:error
echo.
echo ============================================================
echo PATCH 35A.4.2 DUNG VI CO LOI. GUI TOAN BO LOI PHIA TREN.
echo ============================================================
exit /b 1
