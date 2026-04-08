$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "AcademiaCrystalCaja"
$batPath = Join-Path $installDir "abrir-caja-kiosco-local.bat"

if (-not (Test-Path $installDir)) {
  New-Item -ItemType Directory -Path $installDir | Out-Null
}

$launcherContent = @'
@echo off
setlocal
set "URL=https://app.crystaldiamante.com/caja"
set "EDGE1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME1=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "CHROME2=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%EDGE1%" (
  start "" "%EDGE1%" --new-window --kiosk-printing --app=%URL%
  exit /b 0
)
if exist "%EDGE2%" (
  start "" "%EDGE2%" --new-window --kiosk-printing --app=%URL%
  exit /b 0
)
if exist "%CHROME1%" (
  start "" "%CHROME1%" --new-window --kiosk-printing --app=%URL%
  exit /b 0
)
if exist "%CHROME2%" (
  start "" "%CHROME2%" --new-window --kiosk-printing --app=%URL%
  exit /b 0
)
echo No se encontro Microsoft Edge ni Google Chrome en rutas estandar.
pause
exit /b 1
'@

Set-Content -Path $batPath -Value $launcherContent -Encoding ASCII

$desktopPath = [Environment]::GetFolderPath("Desktop")
$startupPath = [Environment]::GetFolderPath("Startup")

$wshell = New-Object -ComObject WScript.Shell

function New-CajaShortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ShortcutPath
  )

  $shortcut = $wshell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $batPath
  $shortcut.WorkingDirectory = $installDir
  $shortcut.WindowStyle = 1
  $shortcut.Description = "Abrir Caja Crystal Diamante"
  $shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
  $shortcut.Save()
}

$desktopShortcut = Join-Path $desktopPath "Caja Crystal Diamante.lnk"
New-CajaShortcut -ShortcutPath $desktopShortcut

$startupShortcut = Join-Path $startupPath "Caja Crystal Diamante.lnk"
New-CajaShortcut -ShortcutPath $startupShortcut

Write-Host "Lanzador local creado en: $batPath"
Write-Host "Acceso directo creado en escritorio: $desktopShortcut"
Write-Host "Acceso directo creado en inicio automático: $startupShortcut"
