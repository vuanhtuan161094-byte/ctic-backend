@echo off
setlocal
set "BACKEND=%~dp0"
set "LAUNCHER=%BACKEND%scripts\demo\cmp-demo-launcher.cjs"
if not exist "%LAUNCHER%" (
  echo [CMP DEMO] Khong tim thay launcher: "%LAUNCHER%"
  pause
  exit /b 2
)
pushd "%BACKEND%"
node "%LAUNCHER%" --runtime-only
set "RESULT=%ERRORLEVEL%"
popd
if not "%RESULT%"=="0" (
  echo.
  echo [CMP DEMO] Khoi dong khong thanh cong. Xem log trong artifacts\demo va manifest trong LocalAppData\CMP\DEMO.
  pause
)
exit /b %RESULT%
