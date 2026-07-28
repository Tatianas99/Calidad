@echo off
REM ============================================================
REM  Inicia el Portal de Calidad KOS (backend + frontend)
REM  Doble clic para levantar los dos servidores.
REM ============================================================
title Iniciar Portal de Calidad KOS

echo Iniciando backend (API)...
cd /d "%~dp0backend"
start "KOS Backend (API)" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Iniciando frontend (portal)...
cd /d "%~dp0frontend"
start "KOS Frontend (Portal)" cmd /k "npm run dev"

echo.
echo Esperando a que arranquen (el backend tarda unos segundos por la sincronizacion con Azure)...
timeout /t 18 /nobreak >nul

echo Abriendo el portal en el navegador...
start "" http://localhost:5173

echo.
echo Listo. Si el navegador muestra error, espera unos segundos y refresca (Ctrl+F5).
echo Para apagar el portal, cierra las dos ventanas negras (Backend y Frontend).
pause
