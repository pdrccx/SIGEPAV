taskkill /F /IM node.exe 2>$null
taskkill /F /IM python.exe 2>$null
taskkill /F /IM ngrok.exe 2>$null
Write-Host "SIGEPAV, Flask y ngrok detenidos." -ForegroundColor Green
