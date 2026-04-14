@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Magic Imger Windows launcher (double click).

set MODE=%~1
if "%MODE%"=="" set MODE=gui
shift /1

set CLI_ARGS=
:collect
if "%~1"=="" goto run
set CLI_ARGS=!CLI_ARGS! "%~1"
shift /1
goto collect

:run
if /I "%MODE%"=="cli" (
  if "%CLI_ARGS%"=="" (
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\run.ps1" -Mode cli
  ) else (
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\run.ps1" -Mode cli -CliArgs %CLI_ARGS%
  )
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\run.ps1" -Mode %MODE%
)
exit /b %ERRORLEVEL%
