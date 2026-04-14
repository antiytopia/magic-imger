@echo off
setlocal

REM Magic Imger Windows repair (double click).
REM Re-downloads embedded Node.js runtime (if needed) and reinstalls npm deps.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" repair
set EXITCODE=%ERRORLEVEL%

if not "%MAGIC_IMGER_NO_PAUSE%"=="1" (
  echo %CMDCMDLINE% | find /I "/c" >nul 2>nul
  if not errorlevel 1 (
    echo(
    echo Press any key to close...
    pause >nul
  )
)

exit /b %EXITCODE%
