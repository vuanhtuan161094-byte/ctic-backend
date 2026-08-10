@echo off
setlocal
cd /d "%~dp0"
call ".\STABILIZE_36C1B.cmd"
exit /b %ERRORLEVEL%
