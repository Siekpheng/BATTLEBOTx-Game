@echo off
setlocal enabledelayedexpansion
title BATTLEBOTx -- AI FARM Combat Robotics
cd /d "%~dp0"

echo ============================================================
echo       BATTLEBOTx -- AI FARM COMBAT ROBOTICS ARENA
echo                 Local Game Launcher
echo ============================================================
echo.

:: 1. Check Python in PATH and common installation directories
set "PYTHON_CMD="

where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
    goto :START_SERVER
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_CMD=py -3"
    goto :START_SERVER
)

for /d %%D in ("%LocalAppData%\Programs\Python\Python3*") do (
    if exist "%%~D\python.exe" (
        set "PYTHON_CMD=%%~D\python.exe"
        goto :START_SERVER
    )
)

for /d %%D in ("%ProgramFiles%\Python3*") do (
    if exist "%%~D\python.exe" (
        set "PYTHON_CMD=%%~D\python.exe"
        goto :START_SERVER
    )
)

:: 2. If Python is missing, display clear instructions and offer download
echo [ERROR] Python was not found on your PC.
echo.
echo BATTLEBOTx requires Python to run its local 3D game server.
echo Please install Python (be sure to check "Add python.exe to PATH"):
echo   https://www.python.org/downloads/
echo.
set /p OPEN_WEB="Would you like to open the Python download page now? (Y/N): "
if /i "%OPEN_WEB%"=="Y" (
    start https://www.python.org/downloads/
)
echo.
echo Press any key to exit...
pause >nul
exit /b 1

:START_SERVER
echo [OK] Python detected: %PYTHON_CMD%
echo [OK] Launching local game server...
echo.

"%PYTHON_CMD%" server.py

if %errorlevel% neq 0 (
    echo.
    echo [NOTICE] Server has stopped.
    echo Press any key to close this window...
    pause >nul
)
