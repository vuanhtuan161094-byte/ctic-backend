@echo off
setlocal
cd /d "%~dp0\.."

echo ============================================================
echo PATCH 35A.3 - MIGRATION, PRISMA GENERATE, BUILD VA REGRESSION
echo ============================================================
echo.
echo YEU CAU: Da sao luu SQL Server va da dung backend truoc khi chay.
echo.

call npx prisma migrate deploy
if errorlevel 1 goto :error

call npx prisma generate
if errorlevel 1 goto :error

call npm run build
if errorlevel 1 goto :error

node .\scripts\tests\integrated-manday-allocation-regression-patch35a3.mjs
if errorlevel 1 goto :error

echo.
echo ============================================================
echo PATCH 35A.3 DA CAI DAT VA KIEM TRA THANH CONG
echo Bay gio chay: npm run start:dev
echo ============================================================
exit /b 0

:error
echo.
echo ============================================================
echo PATCH 35A.3 DUNG VI CO LOI. KHONG BO QUA LOI PHIA TREN.
echo ============================================================
exit /b 1
