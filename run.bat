@echo off
title Servidor Inventario Geomatica UIS
echo ========================================================
echo   Iniciando Servidor de Inventario Geomatica UIS...
echo ========================================================
echo.
python run.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocurrio un error al iniciar. Verifica que Python este instalado.
    pause
)
