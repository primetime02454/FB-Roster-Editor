# -*- mode: python ; coding: utf-8 -*-
import shutil
from PyInstaller.utils.hooks import collect_all

datas = [
    ('app', 'app'),
    ('data\\visual_prefab_options_trimmed.json', 'data'),
    ('data\\cfb27', 'data\\cfb27'),
    ('data\\cfb27_dynasty', 'data\\cfb27_dynasty'),
    (shutil.which('node') or r'C:\Program Files\nodejs\node.exe', 'bin'),
    ('tools', 'tools'),
    ('vendor', 'vendor'),
    ('..\\frontend\\dist', 'frontend\\dist'),
]
binaries = []
hiddenimports = []
tmp_ret = collect_all('webview')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['desktop_app.py'],
    pathex=['C:\\Users\\Shadow\\Desktop\\Coding\\fb-roster-editor-webapp\\backend'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='FB Roster Editor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='FB Roster Editor',
)
