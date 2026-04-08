@echo off
setlocal

set SCRIPT_DIR=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%abrir-caja-kiosco.ps1"

endlocal
