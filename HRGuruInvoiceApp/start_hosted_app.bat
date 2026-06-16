@echo off
cd /d "%~dp0"

if "%INVOICE_APP_USERNAME%"=="" (
  echo Set INVOICE_APP_USERNAME before running this public app.
  echo Example: set INVOICE_APP_USERNAME=admin
  pause
  exit /b 1
)

if "%INVOICE_APP_PASSWORD%"=="" (
  echo Set INVOICE_APP_PASSWORD before running this public app.
  echo Example: set INVOICE_APP_PASSWORD=change-this-password
  pause
  exit /b 1
)

if "%PORT%"=="" set PORT=5055

set "PYTHON_EXE="
if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"
if "%PYTHON_EXE%"=="" if exist "venv\Scripts\python.exe" set "PYTHON_EXE=venv\Scripts\python.exe"
if "%PYTHON_EXE%"=="" if exist "D:\hrguru-ats\venv\Scripts\python.exe" set "PYTHON_EXE=D:\hrguru-ats\venv\Scripts\python.exe"
if "%PYTHON_EXE%"=="" set "PYTHON_EXE=py"

"%PYTHON_EXE%" -m pip install -r requirements.txt
"%PYTHON_EXE%" -m waitress --host=127.0.0.1 --port=%PORT% invoice_web_app:app
