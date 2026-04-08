$ErrorActionPreference = "Stop"

$url = "https://app.crystaldiamante.com/caja"

$edgePaths = @(
  "$Env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$Env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

$chromePaths = @(
  "$Env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
  "$Env:ProgramFiles\Google\Chrome\Application\chrome.exe"
)

$browserPath = $null
$browserArgs = $null

foreach ($candidate in $edgePaths) {
  if (Test-Path $candidate) {
    $browserPath = $candidate
    $browserArgs = @(
      "--new-window",
      "--kiosk-printing",
      "--app=$url"
    )
    break
  }
}

if (-not $browserPath) {
  foreach ($candidate in $chromePaths) {
    if (Test-Path $candidate) {
      $browserPath = $candidate
      $browserArgs = @(
        "--new-window",
        "--kiosk-printing",
        "--app=$url"
      )
      break
    }
  }
}

if (-not $browserPath) {
  Write-Error "No se encontró Microsoft Edge ni Google Chrome instalados en rutas estándar."
}

Start-Process -FilePath $browserPath -ArgumentList $browserArgs