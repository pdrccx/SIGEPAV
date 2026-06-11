cd C:\Users\acontrerasr\Downloads
curl.exe -L -o node-v22.11.0-x64.msi "https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi"
Start-Process msiexec.exe -Wait -ArgumentList '/i "C:\Users\acontrerasr\Downloads\node-v22.11.0-x64.msi" /qn /norestart /L*v "C:\Users\acontrerasr\Downloads\node-install.log"'
Write-Host "Listo. Cierra PowerShell y abre uno nuevo."
