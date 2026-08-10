@echo off
title SIGEPAV - Apagar
echo ================================================
echo    SIGEPAV - Apagando servidores...
echo ================================================
echo.

REM Cierra las ventanas (y sus procesos hijos) que abrio el lanzador.
taskkill /F /T /FI "WINDOWTITLE eq SIGEPAV - Servidor*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq SIGEPAV - Medidor*"  >nul 2>&1

REM Respaldo: por si el servidor se abrio de otra forma, libera el puerto 3000.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1

echo Servidores de SIGEPAV apagados.
echo (MySQL84 se queda encendido; es un servicio de Windows.)
echo.
timeout /t 3 /nobreak >nul
