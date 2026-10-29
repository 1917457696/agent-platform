param(
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 8001,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Python = if ($env:EDURAG_PYTHON) { $env:EDURAG_PYTHON } else { "C:\Users\19174\.conda\envs\EduRAG\python.exe" }
$LogDir = Join-Path $Root "artifacts\server"
$Stdout = Join-Path $LogDir "stdout.log"
$Stderr = Join-Path $LogDir "stderr.log"

if (-not (Test-Path -LiteralPath $Python)) {
  throw "Python not found: $Python. Set EDURAG_PYTHON or update the default path in this script."
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$Arguments = @("-m", "uvicorn", "app.server:app", "--host", $BindHost, "--port", "$Port")

Write-Host "Project root: $Root"
Write-Host "Python: $Python"
Write-Host "URL: http://${BindHost}:$Port"

if ($Foreground) {
  Push-Location $Root
  try {
    & $Python @Arguments
  } finally {
    Pop-Location
  }
  exit $LASTEXITCODE
}

$Process = Start-Process -FilePath $Python -ArgumentList $Arguments -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr -PassThru
$Health = $null
for ($Attempt = 1; $Attempt -le 20; $Attempt++) {
  Start-Sleep -Seconds 1
  try {
    $Health = Invoke-WebRequest -UseBasicParsing -Uri "http://${BindHost}:$Port/health" -TimeoutSec 3
    break
  } catch {
    if ($Attempt -eq 20) {
      Write-Warning "Process started but health check failed. Check: $Stderr"
    }
  }
}

if ($Health) {
  Write-Host "Service is ready: $($Health.StatusCode)"
  Write-Host "Open in browser: http://${BindHost}:$Port"
}
Write-Host "PID: $($Process.Id)"
Write-Host "Logs: $Stdout / $Stderr"
