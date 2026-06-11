# Inicia SIGEPAV completo para ngrok:
# - Node en puerto 3000
# - Flask/Gasolina.py en puerto 5000 interno
# - ngrok apuntando al dominio fijo

$Proyecto = "C:\SIGEPAV\Gesti-n-Vehicular-main"
$Ngrok = "C:\ngrok\ngrok.exe"
$Url = "https://oda-peachier-terrie.ngrok-free.dev"

Set-Location $Proyecto
Set-ExecutionPolicy -Scope Process Bypass -Force

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

Write-Host "Configurando BASE_URL para QR: $Url" -ForegroundColor Cyan
Set-EnvValue ".env" "BASE_URL" $Url
Set-EnvValue "env.env" "BASE_URL" $Url
Set-EnvValue ".env" "FUEL_INTERNAL_URL" "http://127.0.0.1:5000"
Set-EnvValue "env.env" "FUEL_INTERNAL_URL" "http://127.0.0.1:5000"

Write-Host "Deteniendo procesos anteriores..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null
taskkill /F /IM python.exe 2>$null
taskkill /F /IM ngrok.exe 2>$null

Write-Host "Iniciando Node y Flask..." -ForegroundColor Cyan
.\iniciar-en-segundo-plano.ps1
Start-Sleep -Seconds 6

if (!(Test-Path $Ngrok)) {
  Write-Host "No encontré ngrok en C:\ngrok\ngrok.exe" -ForegroundColor Red
  Write-Host "Instálalo y configura tu authtoken antes de usar este script." -ForegroundColor Yellow
  exit 1
}

Write-Host "Iniciando ngrok con dominio fijo..." -ForegroundColor Cyan
Start-Process -FilePath $Ngrok -ArgumentList "http 3000 --url=$Url" -WindowStyle Hidden
Start-Sleep -Seconds 5

try {
  Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/admin/regenerar-qr" -Method POST | Out-Null
  Write-Host "QR regenerados con $Url" -ForegroundColor Green
} catch {
  Write-Host "No pude llamar /api/admin/regenerar-qr; revisa node.log si los QR no se actualizan." -ForegroundColor Yellow
}

Write-Host "SIGEPAV listo:" -ForegroundColor Green
Write-Host "  App / QR: $Url" -ForegroundColor Green
Write-Host "  Flask interno: http://127.0.0.1:5000, expuesto por proxy en $Url/gasolina/" -ForegroundColor Green
Write-Host "Logs:" -ForegroundColor Yellow
Write-Host "  C:\SIGEPAV\node.log"
Write-Host "  C:\SIGEPAV\flask.log"
Write-Host "Ver túnel: Invoke-RestMethod http://127.0.0.1:4040/api/tunnels" -ForegroundColor Yellow
