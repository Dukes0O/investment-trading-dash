@echo off
rem Start Trend Desk (API + built frontend) on http://127.0.0.1:3001/dashboard.html
rem Idempotent: exits silently if something already listens on 3001.
rem Self-healing cold start: installs deps and builds the frontend when missing.
cd /d "%~dp0"
netstat -ano | findstr ":3001" | findstr "LISTENING" > nul 2>&1
if %errorlevel% == 0 exit /b 0
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found on PATH.
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 exit /b 1
)
if not exist dist (
  call npm run build
  if errorlevel 1 exit /b 1
)
node server\index.js
