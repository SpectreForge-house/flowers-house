@echo off
title Create Desktop Shortcuts
color 0B

echo ========================================
echo    Creating Desktop Shortcuts...
echo ========================================
echo.

set "Desktop=%USERPROFILE%\Desktop"
set "ProjectDir=%~dp0"
if "%ProjectDir:~-1%"=="\" set "ProjectDir=%ProjectDir:~0,-1%"

:: Create "Start" shortcut
echo Creating "Flower's House CRM" shortcut...
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%Desktop%\Flower's House CRM.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "%ProjectDir%\launch.vbs"
echo oLink.WorkingDirectory = "%ProjectDir%"
echo oLink.Description = "Start Flower's House CRM"
echo oLink.Save
) > "%temp%\create_shortcut1.vbs"
cscript //nologo "%temp%\create_shortcut1.vbs"
del "%temp%\create_shortcut1.vbs"
echo    Created: Flower's House CRM.lnk
echo.

:: Create "Stop" shortcut
echo Creating "Stop Flower's House CRM" shortcut...
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%Desktop%\Stop Flower's House CRM.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "%ProjectDir%\stop-flower-shop.bat"
echo oLink.WorkingDirectory = "%ProjectDir%"
echo oLink.Description = "Stop Flower's House CRM"
echo oLink.Save
) > "%temp%\create_shortcut2.vbs"
cscript //nologo "%temp%\create_shortcut2.vbs"
del "%temp%\create_shortcut2.vbs"
echo    Created: Stop Flower's House CRM.lnk
echo.

echo ========================================
echo    Done! Shortcuts created on Desktop.
echo ========================================
echo.
echo You now have two shortcuts on your Desktop:
echo.
echo    🌷 Flower's House CRM      - Start the application
echo    🛑 Stop Flower's House CRM - Stop the application
echo.
pause
