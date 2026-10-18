@echo off
setlocal EnableExtensions DisableDelayedExpansion
title CMP - One Click

if /I "%~1"=="--temp-run" goto :run_temp

rem Pass paths via the Unicode environment, never via a quoted trailing-backslash argument.
set "CMP_BACKEND_PATH=%~dp0"
set "CMP_TMP_DIR=%TEMP%\CMP_ONE_CLICK_%RANDOM%_%RANDOM%"
if exist "%CMP_TMP_DIR%\" goto :temp_error
mkdir "%CMP_TMP_DIR%"
if errorlevel 1 goto :temp_error

rem Run copied scripts so a safe Git fast-forward cannot replace the running launcher.
copy /Y "%~f0" "%CMP_TMP_DIR%\launcher.cmd" >nul
if errorlevel 1 goto :copy_error
copy /Y "%~dp0scripts\cmp-one-click.ps1" "%CMP_TMP_DIR%\launcher.ps1" >nul
if errorlevel 1 goto :copy_error

call "%CMP_TMP_DIR%\launcher.cmd" --temp-run "%CMP_TMP_DIR%\launcher.ps1"
set "CMP_RC=%ERRORLEVEL%"
del /Q "%CMP_TMP_DIR%\launcher.cmd" "%CMP_TMP_DIR%\launcher.ps1" >nul 2>&1
rmdir "%CMP_TMP_DIR%" >nul 2>&1
exit /b %CMP_RC%

:run_temp
if not defined CMP_BACKEND_PATH goto :bad_backend
set "CMP_PS1=%~2"
if not exist "%CMP_PS1%" goto :bad_ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%CMP_PS1%"
set "CMP_RC=%ERRORLEVEL%"
if not "%CMP_RC%"=="0" (
    echo.
    echo [FAIL] Launcher exited with code %CMP_RC%.
    pause
)
exit /b %CMP_RC%

:bad_backend
echo [FAIL] Backend path was not passed to the temporary launcher.
pause
exit /b 1

:bad_ps1
echo [FAIL] Temporary PowerShell script not found: "%CMP_PS1%"
pause
exit /b 1

:copy_error
echo [FAIL] Cannot stage the launcher in: "%CMP_TMP_DIR%"
rmdir "%CMP_TMP_DIR%" >nul 2>&1
pause
exit /b 1

:temp_error
echo [FAIL] Temporary launcher folder exists or cannot be created: "%CMP_TMP_DIR%"
pause
exit /b 1
