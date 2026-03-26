@echo off
setlocal

REM Magic Imger Windows launcher (double click).
REM Default: GUI

set MODE=gui
if not "%~1"=="" set MODE=%~1
shift

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" %MODE% %*
exit /b %ERRORLEVEL%

