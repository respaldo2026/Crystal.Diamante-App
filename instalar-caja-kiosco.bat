@echo off
setlocal EnableExtensions

set "INSTALL_DIR=%LocalAppData%\AcademiaCrystalCaja"
set "LAUNCHER_BAT=%INSTALL_DIR%\abrir-caja-kiosco-local.bat"

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo Instalando accesos directos de Caja Crystal Diamante...
echo Creando lanzador local en "%INSTALL_DIR%"...

(
  echo @echo off
  echo setlocal
  echo set "URL=https://app.crystaldiamante.com/caja"
  echo set "EDGE1=%%ProgramFiles(x86)%%\Microsoft\Edge\Application\msedge.exe"
  echo set "EDGE2=%%ProgramFiles%%\Microsoft\Edge\Application\msedge.exe"
  echo set "CHROME1=%%ProgramFiles(x86)%%\Google\Chrome\Application\chrome.exe"
  echo set "CHROME2=%%ProgramFiles%%\Google\Chrome\Application\chrome.exe"
  echo if exist "%%EDGE1%%" ^(
  echo   start "" "%%EDGE1%%" --new-window --kiosk-printing --app=%%URL%%
  echo   exit /b 0
  echo ^)
  echo if exist "%%EDGE2%%" ^(
  echo   start "" "%%EDGE2%%" --new-window --kiosk-printing --app=%%URL%%
  echo   exit /b 0
  echo ^)
  echo if exist "%%CHROME1%%" ^(
  echo   start "" "%%CHROME1%%" --new-window --kiosk-printing --app=%%URL%%
  echo   exit /b 0
  echo ^)
  echo if exist "%%CHROME2%%" ^(
  echo   start "" "%%CHROME2%%" --new-window --kiosk-printing --app=%%URL%%
  echo   exit /b 0
  echo ^)
  echo echo No se encontro Microsoft Edge ni Google Chrome en rutas estandar.
  echo pause
  echo exit /b 1
) > "%LAUNCHER_BAT%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$launcherPath = Join-Path $env:LOCALAPPDATA 'AcademiaCrystalCaja\abrir-caja-kiosco-local.bat';" ^
  "if (-not (Test-Path $launcherPath)) { throw 'No se encontro el lanzador local.' };" ^
  "$desktopPath = [Environment]::GetFolderPath('Desktop');" ^
  "$startupPath = [Environment]::GetFolderPath('Startup');" ^
  "$workingDir = Split-Path -Parent $launcherPath;" ^
  "$wshell = New-Object -ComObject WScript.Shell;" ^
  "$desktopShortcut = $wshell.CreateShortcut((Join-Path $desktopPath 'Caja Crystal Diamante.lnk'));" ^
  "$desktopShortcut.TargetPath = $launcherPath;" ^
  "$desktopShortcut.WorkingDirectory = $workingDir;" ^
  "$desktopShortcut.WindowStyle = 1;" ^
  "$desktopShortcut.Description = 'Abrir Caja Crystal Diamante';" ^
  "$desktopShortcut.IconLocation = \"$env:SystemRoot\System32\SHELL32.dll,220\";" ^
  "$desktopShortcut.Save();" ^
  "$startupShortcut = $wshell.CreateShortcut((Join-Path $startupPath 'Caja Crystal Diamante.lnk'));" ^
  "$startupShortcut.TargetPath = $launcherPath;" ^
  "$startupShortcut.WorkingDirectory = $workingDir;" ^
  "$startupShortcut.WindowStyle = 1;" ^
  "$startupShortcut.Description = 'Abrir Caja Crystal Diamante';" ^
  "$startupShortcut.IconLocation = \"$env:SystemRoot\System32\SHELL32.dll,220\";" ^
  "$startupShortcut.Save();" ^
  "Write-Host 'Accesos directos creados correctamente.';"

set "PS_EXIT=%ERRORLEVEL%"

if not "%PS_EXIT%"=="0" (
  echo.
  echo No se pudieron crear los accesos directos.
  echo Verifica permisos de Windows y vuelve a intentar.
  pause
  exit /b 1
)

echo.
echo Instalacion completada.
echo Se crearon accesos directos en el escritorio y en el inicio automatico.
echo El lanzador local quedo en: "%LAUNCHER_BAT%"
pause

endlocal
