@echo off
setlocal
cd /d "%~dp0\.."
echo Patch 35A.4.5 is deprecated. Routing to STABILIZE_36C1A.cmd...
call ".\STABILIZE_36C1A.cmd"
exit /b %ERRORLEVEL%
