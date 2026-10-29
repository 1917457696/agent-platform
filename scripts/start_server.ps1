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
  throw "找不到 Python：$Python。请设置 EDURAG_PYTHON，或修改脚本中的默认路径。"
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$Arguments = @("-m", "uvicorn", "app.server:app", "--host", $BindHost, "--port", "$Port")

Write-Host "项目目录：$Root"
Write-Host "Python：$Python"
Write-Host "地址：http://${BindHost}:$Port"

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
      Write-Warning "进程已启动但健康检查未通过，请查看日志：$Stderr"
    }
  }
}

if ($Health) {
  Write-Host "服务已启动：$($Health.StatusCode)"
  Write-Host "浏览器打开：http://${BindHost}:$Port"
}
Write-Host "进程 PID：$($Process.Id)"
Write-Host "日志：$Stdout / $Stderr"
