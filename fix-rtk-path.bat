@echo off
REM Fix RTK PATH issue - adds nodejs to system PATH
REM Run this as Administrator

echo Checking current PATH...
echo.

REM Check if nodejs is already in PATH
echo %PATH% | findstr /I /C:"nodejs" >nul
if %errorlevel%==0 (
    echo nodejs is already in PATH
    pause
    exit /b 0
)

echo Adding C:\Program Files\nodejs to system PATH...
echo.

REM Add nodejs to system PATH using PowerShell
powershell -Command "& {$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'Machine'); if ($currentPath -notlike '*nodejs*') {$newPath = $currentPath + ';C:\Program Files\nodejs'; [Environment]::SetEnvironmentVariable('PATH', $newPath, 'Machine'); Write-Host 'SUCCESS: Added nodejs to PATH' -ForegroundColor Green} else {Write-Host 'nodejs already in PATH' -ForegroundColor Yellow}}"

echo.
echo DONE! Close this terminal and open a new one.
echo Then test with: rtk npm --version
echo.
pause
