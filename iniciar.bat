@echo off
chcp 65001 >nul
title App Barbearia - Servidor (deixe esta janela aberta)
cd /d "%~dp0"

rem Garante o Node no PATH (instalado fora do PATH neste PC)
set "PATH=C:\Program Files\nodejs;%PATH%"

rem Descobre o IP local (rede) de forma limpa, via PowerShell
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LANIP=%%i"

echo ==============================================
echo   APP BARBEARIA
echo ==============================================
echo.
echo   Abra no navegador:
echo     Neste PC:    http://localhost:3000
if defined LANIP echo     No celular:  http://%LANIP%:3000   (mesma Wi-Fi)
echo.
echo   Deixe ESTA JANELA ABERTA enquanto usar o app.
echo   Para parar: feche a janela ou pressione Ctrl+C.
echo ==============================================
echo.

node src/server.js

echo.
echo   O servidor parou. Pressione uma tecla para fechar.
pause >nul
