@echo off
title SIGEPAV - Lanzador
REM Se ubica solo: %~dp0 es la carpeta donde esta este .bat (la raiz del proyecto)
cd /d "%~dp0"

echo ================================================
echo    SIGEPAV - Encendiendo servidores...
echo ================================================
echo.

REM --- 1) MySQL (servicio de Windows MySQL84) ---
sc query MySQL84 | find "RUNNING" >nul
if errorlevel 1 (
    echo [MySQL]   No esta corriendo. Intentando iniciarlo...
    net start MySQL84 >nul 2>&1
    if errorlevel 1 (
        echo [MySQL]   No se pudo iniciar automaticamente.
        echo           Si la app marca error de BD, abre "Servicios" de Windows
        echo           y arranca "MySQL84" a mano ^(o corre este .bat como administrador^).
    ) else (
        echo [MySQL]   Iniciado.
    )
) else (
    echo [MySQL]   OK, ya esta corriendo.
)
echo.

REM --- 2) Medidor de combustible (Flask, puerto 5000) - opcional ---
echo [Medidor] Abriendo el medidor de gasolina en el puerto 5000...
start "SIGEPAV - Medidor" cmd /k "python medidor\Gasolina.py || py medidor\Gasolina.py || (echo. & echo No se encontro Python. El medidor es opcional; el resto funciona igual. & pause)"

REM --- 3) Servidor principal (Node, puerto 3000) ---
echo [Node]    Abriendo el servidor principal en el puerto 3000...
start "SIGEPAV - Servidor" cmd /k "node Server.js"

REM --- 4) Esperar y abrir el navegador ---
echo [Web]     Esperando a que arranque el servidor...
timeout /t 7 /nobreak >nul
echo [Web]     Abriendo http://localhost:3000 ...
start "" http://localhost:3000

echo.
echo ================================================
echo    LISTO. Ya puedes cerrar ESTA ventana.
echo.
echo    NO cierres las ventanas "SIGEPAV - Servidor"
echo    ni "SIGEPAV - Medidor" mientras uses la app.
echo    Para apagar todo usa APAGAR-SIGEPAV.bat
echo ================================================
timeout /t 6 /nobreak >nul
