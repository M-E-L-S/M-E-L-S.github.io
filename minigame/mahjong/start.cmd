@echo off
cd /d "%~dp0"
python serve.py --directory . --open
pause
