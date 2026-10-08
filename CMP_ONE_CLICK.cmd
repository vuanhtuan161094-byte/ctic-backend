@echo off
setlocal EnableExtensions EnableDelayedExpansion
title CMP - One Click

if /I not "%~1"=="--temp-run" (
  set "CMP_TMP_CMD=%TEMP%\CMP_ONE_CLICK_!RANDOM!_!RANDOM!.cmd"
  set "CMP_TMP_PS1=%TEMP%\CMP_ONE_CLICK_!RANDOM!_!RANDOM!.ps1"
  copy /Y "%~f0" "!CMP_TMP_CMD!" >nul || exit /b 1
  copy /Y "%~dp0scripts\cmp-one-click.ps1" "!CMP_TMP_PS1!" >nul || (
    echo [FAIL] Missing scripts\cmp-one-click.ps1
    del /Q "!CMP_TMP_CMD!" >nul 2>&1
    pause
    exit /b 1
  )
  call "!CMP_TMP_CMD!" --temp-run "%~dp0" "!CMP_TMP_PS1!"
  set "CMP_RC=!ERRORLEVEL!"
  del /Q "!CMP_TMP_CMD!" "!CMP_TMP_PS1!" >nul 2>&1
  exit /b !CMP_RC!
)

set "CMP_BACKEND=%~2"
set "CMP_PS1=%~3"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%CMP_PS1%" -BackendPath "%CMP_BACKEND%"
set "CMP_RC=%ERRORLEVEL%"

if not "%CMP_RC%"=="0" (
  echo.
  echo Launcher failed with exit code %CMP_RC%.
  pause
)

exit /b %CMP_RC%
