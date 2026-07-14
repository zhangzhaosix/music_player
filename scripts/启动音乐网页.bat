@echo off
cd /d "%~dp0.."
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" code\backend\app.py
) else (
    python code\backend\app.py
)
