@echo off
:: build.bat — Rebuild dist/ and push to GitHub.
::
:: Usage:
::   build.bat           — build + commit + push
::   build.bat nocommit  — build only, skip git

cd /d "%~dp0"

echo [BUILD] Compiling dist...
npx vite build
if %errorlevel% neq 0 (
    echo [FAILED] Build error - see above.
    pause
    exit /b 1
)
echo [OK] Build complete.

if /i "%1"=="nocommit" (
    echo [SKIP] Git commit/push skipped.
    exit /b 0
)

echo.
echo [GIT] Staging and committing dist/...
git add dist/
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo [GIT] No changes to dist/ - nothing to commit.
    exit /b 0
)

:: Timestamp in commit message
for /f "tokens=1-3 delims=/" %%a in ("%date%") do set DATESTAMP=%%c-%%b-%%a
for /f "tokens=1-2 delims=: " %%a in ("%time%") do set TIMESTAMP=%%a:%%b

git commit -m "rebuild dist [%DATESTAMP% %TIMESTAMP%]"
if %errorlevel% neq 0 (
    echo [FAILED] git commit failed.
    pause
    exit /b 1
)

echo [GIT] Pushing to GitHub...
git push
if %errorlevel% neq 0 (
    echo [FAILED] git push failed. Check your remote/auth.
    pause
    exit /b 1
)

echo [DONE] dist/ pushed to GitHub.
