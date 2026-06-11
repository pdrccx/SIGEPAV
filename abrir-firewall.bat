@echo off
netsh advfirewall firewall add rule name="SIGEPAV Node 3000" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="SIGEPAV Flask 5000" dir=in action=allow protocol=TCP localport=5000
echo Listo. Para ngrok solo necesitas exponer el 3000; Flask 5000 queda interno por proxy de Node.
pause
