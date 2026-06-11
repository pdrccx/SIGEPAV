@echo off
cd /d C:\SIGEPAV\Gesti-n-Vehicular-main
start "SIGEPAV Node" cmd /k npm start
start "SIGEPAV Medidor Flask" cmd /k python Gasolina.py
