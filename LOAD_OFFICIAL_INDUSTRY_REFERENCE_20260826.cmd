@echo off
setlocal
cd /d "%~dp0"
node scripts\load-official-industry-reference-20260826.cjs --replace --commit
exit /b %ERRORLEVEL%
