# Inicia SIGEPAV Node y Flask en segundo plano.
# Ejecutar desde PowerShell en la VM:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\iniciar-en-segundo-plano.ps1

$Proyecto = "C:\SIGEPAV\Gesti-n-Vehicular-main"
$NodeLog = "C:\SIGEPAV\node.log"
$FlaskLog = "C:\SIGEPAV\flask.log"
$Npm = "C:\Program Files\nodejs\npm.cmd"
$Python = "C:\Program Files\Python312\python.exe"

if (!(Test-Path $Proyecto)) {
    Write-Host "No existe la carpeta del proyecto: $Proyecto" -ForegroundColor Red
    exit 1
}
if (!(Test-Path $Npm)) { $Npm = "npm" }
if (!(Test-Path $Python)) { $Python = "python" }

Write-Host "Iniciando SIGEPAV Node en puerto 3000..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$Proyecto`" && `"$Npm`" start > `"$NodeLog`" 2>&1" -WindowStyle Hidden

Write-Host "Iniciando medidor Flask en puerto 5000..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$Proyecto`" && `"$Python`" Gasolina.py > `"$FlaskLog`" 2>&1" -WindowStyle Hidden

Start-Sleep -Seconds 3
Write-Host "\nPuertos activos:" -ForegroundColor Green
cmd /c "netstat -ano | findstr :3000"
cmd /c "netstat -ano | findstr :5000"
Write-Host "\nLogs:" -ForegroundColor Green
Write-Host "Node:  $NodeLog"
Write-Host "Flask: $FlaskLog"
Write-Host "\nURL pública: https://oda-peachier-terrie.ngrok-free.dev" -ForegroundColor Yellow
