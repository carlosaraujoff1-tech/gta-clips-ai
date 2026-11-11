@echo off
rem GTA Clips AI - inicia o backend e a interface e abre o navegador.
rem Pre-requisitos: ver docs\INSTALACAO-WINDOWS.md (uv e Node.js instalados, uv sync e npm install feitos).
rem Este atalho nao foi testado no Windows ainda: se falhar, use o "jeito manual" do guia.

set "RAIZ=%~dp0.."

where uv >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O programa "uv" nao foi encontrado. Instale-o e abra um terminal novo.
  echo Veja docs\INSTALACAO-WINDOWS.md
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Node.js ^(npm^) nao foi encontrado. Instale-o e abra um terminal novo.
  echo Veja docs\INSTALACAO-WINDOWS.md
  pause
  exit /b 1
)

echo Iniciando o backend...
start "GTA Clips AI - Backend (nao feche)" cmd /k "cd /d "%RAIZ%\backend" && uv run python -m app.main"

echo Iniciando a interface...
start "GTA Clips AI - Interface (nao feche)" cmd /k "cd /d "%RAIZ%\frontend" && npm run dev"

echo Aguardando a interface ficar pronta...
timeout /t 12 /nobreak >nul
start "" "http://localhost:3000"
