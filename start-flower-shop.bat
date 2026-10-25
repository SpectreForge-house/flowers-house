@echo off
title Flower's House CRM
color 0A

echo ========================================
echo    Flower's House - Flower Shop CRM
echo ========================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [ERROR] node_modules not found.
    echo Please run "npm install" first.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\electron" (
    echo [ERROR] Electron not found.
    echo Please run "npm install" first.
    echo.
    pause
    exit /b 1
)

echo Starting Flower's House CRM...
echo.

call "node_modules\.bin\electron.cmd" .

echo.
echo CRM closed.
pause
