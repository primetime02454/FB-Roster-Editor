@echo off
setlocal
cd /d %~dp0

echo Building frontend for desktop shell...
call npm.cmd --prefix frontend install
call npm.cmd --prefix frontend run build
if errorlevel 1 exit /b 1

cd /d %~dp0backend
if not exist .venv (
  py -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements-desktop.txt
if errorlevel 1 exit /b 1

python desktop_app.py
