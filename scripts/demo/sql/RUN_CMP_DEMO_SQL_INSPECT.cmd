@echo off
setlocal
echo [CMP] Read-only SQL inspection. No bootstrap or service changes.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0inspect-cmp-demo-sql.ps1"
set "RESULT=%ERRORLEVEL%"
echo [CMP] Inspection exit code: %RESULT%. Logs: CMP\artifacts\sql\diagnostics
pause
exit /b %RESULT%
