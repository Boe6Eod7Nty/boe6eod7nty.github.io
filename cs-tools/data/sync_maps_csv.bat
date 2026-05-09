@echo off
title CS Tools - Sync Maps CSV
echo Merging maps.csv into maps.json and maps-data.js...
python csv_to_maps.py maps.csv --merge
echo.
echo Sync complete.
pause
