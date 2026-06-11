param(
  [Parameter(Mandatory=$false)]
  [string]$Url = "https://oda-peachier-terrie.ngrok-free.dev"
)

$Proyecto = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Proyecto
$Url = $Url.Trim().TrimEnd('/')
if ($Url -notmatch '^https?://') {
  Write-Host "La URL debe empezar con http:// o https://" -ForegroundColor Red
  exit 1
}

function Set-EnvValue($file, $key, $value) {
  if (!(Test-Path $file)) { New-Item -ItemType File -Path $file -Force | Out-Null }
  $lines = Get-Content $file -ErrorAction SilentlyContinue
  $pattern = "^\s*$([regex]::Escape($key))\s*="
  if ($lines -match $pattern) {
    $lines = $lines -replace "$pattern.*", "$key=$value"
    Set-Content -Path $file -Value $lines -Encoding UTF8
  } else {
    Add-Content -Path $file -Value "$key=$value"
  }
}

Set-EnvValue ".env" "BASE_URL" $Url
Set-EnvValue "env.env" "BASE_URL" $Url
Set-EnvValue ".env" "FUEL_INTERNAL_URL" "http://127.0.0.1:5000"
Set-EnvValue "env.env" "FUEL_INTERNAL_URL" "http://127.0.0.1:5000"
Write-Host "BASE_URL actualizado a $Url" -ForegroundColor Green

Write-Host "Reiniciando SIGEPAV para regenerar QR..." -ForegroundColor Cyan
taskkill /F /IM node.exe 2>$null
taskkill /F /IM python.exe 2>$null
Set-ExecutionPolicy -Scope Process Bypass -Force
& (Join-Path $PSScriptRoot 'iniciar-en-segundo-plano.ps1')
Start-Sleep -Seconds 6

try {
  Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/admin/regenerar-qr" -Method POST | Out-Null
  Write-Host "QR regenerados con $Url" -ForegroundColor Green
} catch {
  Write-Host "No pude llamar /api/admin/regenerar-qr; Server.js los regenerará al arrancar si detecta cambio de BASE_URL." -ForegroundColor Yellow
}

Write-Host "Listo. Prueba: $Url" -ForegroundColor Green
