# Detiene los procesos de SIGEPAV levantados en la VM.
# OJO: mata procesos node.exe y python.exe de esta VM.

taskkill /F /IM node.exe 2>$null
taskkill /F /IM python.exe 2>$null
Write-Host "SIGEPAV Node y Flask detenidos." -ForegroundColor Green
