@echo off
cd /d "%~dp0"
echo Starting HR Guru Invoice App...
echo.
py -m pip install -r requirements.txt
echo.
py invoice_web_app.py
pause
