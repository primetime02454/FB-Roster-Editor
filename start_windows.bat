@echo off
setlocal
cd /d %~dp0

echo Building frontend...
call npm.cmd --prefix frontend install
call npm.cmd --prefix frontend run build
if errorlevel 1 exit /b 1

echo Preparing backend...
cd /d %~dp0backend
if not exist .venv (
  py -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 exit /b 1

start "" http://127.0.0.1:8000
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
