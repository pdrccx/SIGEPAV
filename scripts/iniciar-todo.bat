@echo off
REM Se localiza solo: %~dp0 es la carpeta scripts\, ".." es la raiz del proyecto.
cd /d "%~dp0.."
start "SIGEPAV Node" cmd /k npm start
start "SIGEPAV Medidor Flask" cmd /k python medidor\Gasolina.py
