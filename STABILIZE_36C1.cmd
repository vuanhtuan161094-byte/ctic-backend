@echo off
setlocal
cd /d "%~dp0"
echo STABILIZE_36C1.cmd is superseded by 36C.1a. Routing to the safe credential-separated flow...
call ".\STABILIZE_36C1A.cmd"
exit /b %ERRORLEVEL%
