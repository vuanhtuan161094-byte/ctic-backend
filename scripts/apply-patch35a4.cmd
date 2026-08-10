@echo off
setlocal
cd /d "%~dp0\.."

echo ============================================================
echo PATCH 35A.4 - SUA PRISMA CLIENT, BUILD VA KIEM TRA
echo ============================================================
echo.
echo Hay dung backend dang chay bang Ctrl+C truoc khi tiep tuc.
echo.

if exist "node_modules\.prisma\client" (
  echo Xoa Prisma Client cu...
  rmdir /s /q "node_modules\.prisma\client"
)

echo Tao lai Prisma Client tu schema hien tai...
call npx prisma generate
if errorlevel 1 goto :error

echo Kiem tra model Prisma...
node .\scripts\verify-prisma-client-patch35a4.cjs
if errorlevel 1 goto :error

echo Ap dung migration con thieu neu co...
call npx prisma migrate deploy
if errorlevel 1 goto :error

echo Build backend...
call npm run build
if errorlevel 1 goto :error

echo Chay regression Patch 35A.4...
node .\scripts\tests\program-month-manual-manday-regression-patch35a4.mjs
if errorlevel 1 goto :error

echo.
echo ============================================================
echo PATCH 35A.4 DA CAI DAT THANH CONG
echo Chay backend: npm run start:dev
echo ============================================================
exit /b 0

:error
echo.
echo ============================================================
echo PATCH 35A.4 DUNG VI CO LOI. GUI TOAN BO LOI PHIA TREN.
echo ============================================================
exit /b 1
