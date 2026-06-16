@echo off
cd /d "%~dp0"

if "%PORT%"=="" set PORT=5055

if exist "D:\hrguru-ats\cloudflared.exe" (
  "D:\hrguru-ats\cloudflared.exe" tunnel --url http://127.0.0.1:%PORT%
) else (
  echo cloudflared.exe was not found at D:\hrguru-ats\cloudflared.exe
  echo Copy cloudflared.exe here or update this batch file to point to your Cloudflare Tunnel executable.
  pause
  exit /b 1
)
