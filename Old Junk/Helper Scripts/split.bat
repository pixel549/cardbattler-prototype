@echo off
:: split.bat  —  Refresh slice files from the canonical CSVs.
:: Run this after directly editing enemies.csv / cards.csv / etc.
:: (e.g. after running scale_enemy_hp.cjs, or after hand-editing a canonical CSV)
echo.
echo ==========================================
echo  Splitting canonical CSVs -> slices
echo ==========================================
echo.
node tools/merge_slices.cjs --split
echo.
pause
