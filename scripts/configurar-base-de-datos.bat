@echo off
chcp 65001 >nul
REM Se localiza solo: %~dp0 es scripts\, ".." es la raiz del proyecto.
cd /d "%~dp0.."
set "MYSQL=C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"

echo ============================================================
echo   SIGEPAV - Configuracion de la base de datos (UNA sola vez)
echo ============================================================
echo.

if not exist "%MYSQL%" (
  echo No encontre mysql.exe en:
  echo   %MYSQL%
  echo Ajusta la ruta dentro de este .bat si tu MySQL esta en otro lugar.
  pause
  exit /b 1
)

echo Se te pedira la contrasena de ROOT de MySQL DOS veces.
echo (Es la que pusiste al INSTALAR MySQL 8.4. Al escribir no se ve: es normal.)
echo.
pause
echo.

echo [1/2] Importando la base de datos (crea 'sigepav' con tablas y datos)...
"%MYSQL%" -u root -p < "database\sigepav_corregido.sql"
if errorlevel 1 goto error

echo.
echo [2/2] Creando el usuario 'sigepav_user' que ocupa la app...
"%MYSQL%" -u root -p -e "CREATE USER IF NOT EXISTS 'sigepav_user'@'localhost' IDENTIFIED BY 'Sigepav2026!DB#'; GRANT ALL PRIVILEGES ON sigepav.* TO 'sigepav_user'@'localhost'; FLUSH PRIVILEGES;"
if errorlevel 1 goto error

echo.
echo ============================================================
echo   LISTO! Base de datos configurada correctamente.
echo   Ahora corre la app con:  scripts\iniciar-sigepav.bat
echo ============================================================
pause
exit /b 0

:error
echo.
echo *** Hubo un error (probablemente la contrasena de root no es correcta). ***
echo Vuelve a intentarlo o avisame.
pause
exit /b 1
