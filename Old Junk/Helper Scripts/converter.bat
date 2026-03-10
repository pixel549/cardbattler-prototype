@echo off
cd /d "C:\Users\jaste\cardbattler"

REM Check project exists
if not exist "package.json" (
    echo [ERROR] Project not found at C:\Users\jaste\cardbattler
    pause
    exit /b 1
)

REM Check npm is installed
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo [SETUP] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

REM Build content
echo [BUILD] Building content...
call npm run build:content
if errorlevel 1 (
    echo [ERROR] build:content failed - check errors above
    pause
    exit /b 1
)

REM Validate content
echo [BUILD] Validating content...
call npm run validate:content
if errorlevel 1 (
    echo [ERROR] validate:content failed - check errors above
    pause
    exit /b 1
)

REM Start server and open Chrome
echo [START] Launching game in Google Chrome...

REM This line opens Chrome to the specific port. 
REM If Chrome is not in your PATH, you may need the full path: "C:\Program Files\Google\Chrome\Application\chrome.exe"
start chrome "http://localhost:5203"

REM We remove the --open flag here so the default browser doesn't also open
call npm run dev -- --port 5203
pause