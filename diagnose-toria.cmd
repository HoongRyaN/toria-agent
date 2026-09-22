@echo off
cd /d "%~dp0"
echo TORIA connection check - no model inference, no API key output.
node scripts/doctor.mjs
pause
