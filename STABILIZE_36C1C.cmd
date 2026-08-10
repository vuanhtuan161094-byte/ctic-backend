@echo off
setlocal
cd /d "%~dp0"

echo ===========================================================
echo CMP Patch 36C.1c - Windows PowerShell Parse Hotfix
echo ===========================================================
echo IMPORTANT: Stop all running backend processes first.
echo This process does NOT reset or delete certification data.
echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: powershell.exe was not found.
  echo Use Windows PowerShell 5.1 or configure a dedicated MIGRATION_DATABASE_URL.
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ".\scripts\stabilize-windows-patch36c1c.ps1"
if errorlevel 1 (
  echo.
  echo ===========================================================
  echo STABILIZATION FAILED - do not start backend yet.
  echo Review the first ERROR or FAIL shown above.
  echo ===========================================================
  exit /b 1
)

exit /b 0
