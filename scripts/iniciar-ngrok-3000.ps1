$Ngrok = "C:\ngrok\ngrok.exe"
$Url = "https://oda-peachier-terrie.ngrok-free.dev"
if (!(Test-Path $Ngrok)) {
  Write-Host "No encontré ngrok en C:\ngrok\ngrok.exe" -ForegroundColor Red
  exit 1
}
Write-Host "Iniciando ngrok para SIGEPAV..." -ForegroundColor Cyan
Write-Host "URL pública: $Url" -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/k `"$Ngrok`" http 3000 --url=$Url" -WindowStyle Normal
