@echo off
setlocal enabledelayedexpansion

REM Regenerate maps-data.js from maps.json (Windows wrapper).
REM This script is safe to double-click or run from any working directory.

set "SCRIPT_DIR=%~dp0"
set "PY_SCRIPT=%SCRIPT_DIR%regen_maps_data_js.py"
set "JSON_PATH=%SCRIPT_DIR%maps.json"
set "OUT_PATH=%SCRIPT_DIR%maps-data.js"

if not exist "%PY_SCRIPT%" (
  echo ERROR: Missing "%PY_SCRIPT%".
  echo.
  pause
  exit /b 1
)

if not exist "%JSON_PATH%" (
  echo ERROR: Missing "%JSON_PATH%".
  echo.
  pause
  exit /b 1
)

REM Prefer the Windows Python launcher if available.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%PY_SCRIPT%" --json "%JSON_PATH%" --out "%OUT_PATH%"
  set "EXITCODE=!errorlevel!"
) else (
  REM Fallback to python on PATH.
  where python >nul 2>nul
  if %errorlevel%==0 (
    python "%PY_SCRIPT%" --json "%JSON_PATH%" --out "%OUT_PATH%"
    set "EXITCODE=!errorlevel!"
  ) else (
    echo ERROR: Python not found. Install Python 3 or ensure it is on PATH.
    echo        Recommended: install from python.org and enable "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
  )
)

if not "!EXITCODE!"=="0" (
  echo.
  echo ERROR: Regeneration failed (exit code !EXITCODE!).
  echo.
  pause
  exit /b !EXITCODE!
)

echo.
echo Done.
pause
exit /b 0

