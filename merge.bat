@echo off
:: merge.bat  —  Merge edited slices back into canonical CSVs and rebuild gamedata.json
:: Run this after editing anything in content_src\slices\
echo.
echo ==========================================
echo  Merging slices + rebuilding gamedata.json
echo ==========================================
echo.
node tools/merge_slices.cjs --build
echo.
pause
