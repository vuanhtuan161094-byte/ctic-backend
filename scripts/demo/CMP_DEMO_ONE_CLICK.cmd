@echo off
setlocal
set "CMP_DEMO_BACKEND=%~dp0..\.."
pushd "%CMP_DEMO_BACKEND%" >nul 2>&1
if errorlevel 1 (
  echo CMP DEMO: khong mo duoc thu muc backend.
  pause
  exit /b 1
)
where node.exe >nul 2>&1
if errorlevel 1 (
  echo CMP DEMO: chua tim thay Node.js trong PATH.
  echo Hay cai Node.js 22.12+ hoac mo tu terminal CMP da duoc cau hinh.
  popd
  pause
  exit /b 1
)
node.exe scripts\demo\cmp-demo-launcher.cjs --runtime-only
set "CMP_DEMO_EXIT=%ERRORLEVEL%"
if not "%CMP_DEMO_EXIT%"=="0" (
  echo.
  echo CMP DEMO chua khoi dong thanh cong. Xem artifacts\demo va %LOCALAPPDATA%\CMP\DEMO.
  pause
)
popd
exit /b %CMP_DEMO_EXIT%
