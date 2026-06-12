@echo off
setlocal
cd /d %~dp0

set "BUNDLED_PY=C:\Users\Shadow\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

echo Building frontend...
call npm.cmd --prefix frontend install
call npm.cmd --prefix frontend run build
if errorlevel 1 exit /b 1

cd /d %~dp0backend
if not exist .venv (
  if exist "%BUNDLED_PY%" (
    "%BUNDLED_PY%" -m venv .venv
  ) else (
    py -m venv .venv
  )
)
call .venv\Scripts\activate.bat
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
if errorlevel 1 exit /b 1

echo Refreshing bundled Node dependencies...
call npm.cmd --prefix vendor\madden-file-tools install --omit=dev
if errorlevel 1 exit /b 1
call npm.cmd --prefix vendor\madden-franchise install --omit=dev
if errorlevel 1 exit /b 1

if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

.venv\Scripts\python.exe -m PyInstaller --noconfirm "FB Roster Editor.spec" > pyinstaller_build.log 2>&1
if errorlevel 1 (
  echo.
  echo PyInstaller build failed. See:
  echo %cd%\pyinstaller_build.log
  exit /b 1
)

set "ASSET_ROOT=%cd%\dist\FB Roster Editor\assets"
if not exist "%ASSET_ROOT%" mkdir "%ASSET_ROOT%"
robocopy "data\Player_Portraits" "%ASSET_ROOT%\Player_Portraits" /E /NFL /NDL /NJH /NJS /NC /NS
if errorlevel 8 exit /b %errorlevel%
robocopy "..\frontend\public\team-logos" "%ASSET_ROOT%\team-logos" /E /NFL /NDL /NJH /NJS /NC /NS
if errorlevel 8 exit /b %errorlevel%
robocopy "..\frontend\public\conference-logos" "%ASSET_ROOT%\conference-logos" /E /NFL /NDL /NJH /NJS /NC /NS
if errorlevel 8 exit /b %errorlevel%
robocopy "..\frontend\public\NFL_Logos" "%ASSET_ROOT%\NFL_Logos" /E /NFL /NDL /NJH /NJS /NC /NS
if errorlevel 8 exit /b %errorlevel%

echo.
echo Desktop EXE created at:
echo %cd%\dist\FB Roster Editor\FB Roster Editor.exe
