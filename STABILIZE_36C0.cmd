@echo off
setlocal
cd /d "%~dp0"
echo STABILIZE_36C0.cmd is deprecated. Routing to STABILIZE_36C1A.cmd...
call ".\STABILIZE_36C1A.cmd"
exit /b %ERRORLEVEL%
