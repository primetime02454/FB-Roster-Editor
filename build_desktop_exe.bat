@echo off
setlocal
cd /d %~dp0

echo Building frontend...
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

pyinstaller ^
  --noconfirm ^
  --clean ^
  --windowed ^
  --name "Madden Roster Editor" ^
  --paths "%cd%" ^
  --add-data "app;app" ^
  --add-data "data;data" ^
  --add-data "..\frontend\dist;frontend\dist" ^
  --collect-all webview ^
  desktop_app.py

echo.
echo Desktop EXE created at:
echo %cd%\dist\Madden Roster Editor\Madden Roster Editor.exe
