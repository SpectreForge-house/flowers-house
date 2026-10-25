@echo off
setlocal enabledelayedexpansion
title Stop Flower's House CRM
color 0C

echo ========================================
echo    Stopping Flower's House CRM...
echo ========================================
echo.

set "stopped=0"
set "ProjectDir=%~dp0"
if "%ProjectDir:~-1%"=="\" set "ProjectDir=%ProjectDir:~0,-1%"

for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-flower-shop.ps1" -ProjectDir "%ProjectDir%"`) do (
    echo Found Flower's House process - PID %%p - terminating...
    set "stopped=1"
)

echo.
if "!stopped!"=="0" (
    echo No Flower's House CRM server was running.
) else (
    echo Flower's House CRM has been stopped successfully.
)

echo.
echo ========================================
endlocal
pause
