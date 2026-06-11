@echo off
REM Se localiza solo: %~dp0 es la carpeta scripts\, ".." es la raiz del proyecto.
cd /d "%~dp0.."
npm start
pause
