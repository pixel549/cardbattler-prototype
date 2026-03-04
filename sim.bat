@echo off
:: sim.bat — Run a headless game simulation and write results to:
::   sim-output.txt   (full readable log — read with Read tool)
::   sim-result.json  (structured JSON summary)
::
:: Usage:
::   sim.bat               — random seed, balanced AI
::   sim.bat 12345         — fixed seed
::   sim.bat 12345 aggressive
::   sim.bat 12345 aggressive 5000

cd /d "%~dp0"

set SEED=%1
set STYLE=%2
set STEPS=%3

if "%SEED%"==""  set SEED=0
if "%STYLE%"="" set STYLE=balanced
if "%STEPS%"="" set STEPS=3000

echo [SIM] seed=%SEED% playstyle=%STYLE% maxSteps=%STEPS%
echo.

npx vite-node tools/headless-sim.mjs %SEED% %STYLE% %STEPS%

if %errorlevel% neq 0 (
    echo.
    echo [SIM] Finished with errors. Check sim-output.txt for details.
) else (
    echo.
    echo [SIM] Done. Results in sim-output.txt and sim-result.json
)
