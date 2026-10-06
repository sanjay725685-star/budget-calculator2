@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "Personal Budget Server" cmd /k "node server.js"
timeout /t 2 /nobreak >nul

where code >nul 2>nul
if not errorlevel 1 (
  start "" code "%~dp0"
)

start "" "http://localhost:3000"
echo Personal Budget Calculator started.
exit /b 0
