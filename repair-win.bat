@echo off
setlocal

REM Magic Imger Windows repair (double click).
REM Re-downloads embedded Node.js runtime (if needed) and reinstalls npm deps.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" repair
exit /b %ERRORLEVEL%

