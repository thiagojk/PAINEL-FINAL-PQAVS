@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
echo ============================================================
echo   PQAVS - Iniciar painel local
echo ============================================================
echo.

where py >nul 2>&1
if errorlevel 1 goto tentar_python
py -3.12 -c "import sys; sys.exit(sys.version_info[:2] != (3, 12))" >nul 2>&1
if errorlevel 1 goto tentar_python
py -3.12 "%~dp0scripts\windows_launcher.py"
goto resultado

:tentar_python
where python >nul 2>&1
if errorlevel 1 goto python_ausente
python -c "import sys; sys.exit(sys.version_info[:2] != (3, 12))" >nul 2>&1
if errorlevel 1 goto python_ausente
python "%~dp0scripts\windows_launcher.py"
goto resultado

:python_ausente
echo [ERRO] Python 3.12 nao foi encontrado ou a versao instalada nao e compativel.
echo Instale o Python 3.12 de https://www.python.org/downloads/windows/
echo Marque "Add python.exe to PATH" durante a instalacao.
echo Depois feche esta janela e clique novamente em INICIAR_PAINEL.bat.
pause
exit /b 1

:resultado
if errorlevel 1 goto falha
exit /b 0

:falha
echo.
echo [ERRO] O painel nao foi iniciado. Consulte a mensagem acima.
pause
exit /b 1
