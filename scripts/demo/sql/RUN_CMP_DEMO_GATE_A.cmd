@echo off
setlocal
set "SCRIPT=%~dp0cmp-demo-gate-a.ps1"
set "DEMO_CREDENTIALS=%LOCALAPPDATA%\CMP\DEMO\sql-credentials.json"
if not exist "%SCRIPT%" (
  echo [CMP] Gate A script is missing: "%SCRIPT%"
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Apply -CredentialPath "%DEMO_CREDENTIALS%"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo [CMP] Gate A did not complete. Check E:\0. Lập trình\CMP\artifacts\sql\gate-a\ for the log.
  pause
)
exit /b %RESULT%
