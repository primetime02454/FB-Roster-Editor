from __future__ import annotations

import sys
import threading
import time
import urllib.request
import os
import base64
from pathlib import Path

import uvicorn

try:
    import webview
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pywebview is required for desktop mode. Install desktop dependencies with "
        "`pip install -r requirements-desktop.txt`."
    ) from exc


HOST = "127.0.0.1"
PORT = 8000
APP_URL = f"http://{HOST}:{PORT}"
APP_NAME = "FB Roster Editor"


class DesktopApi:
    def _prompt_save_path(self, suggested_name: str):
        target = webview.windows[0].create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=suggested_name or "roster",
        )
        if not target:
            return None
        if isinstance(target, (list, tuple)):
            return Path(target[0])
        return Path(target)

    def save_download(self, url: str, suggested_name: str) -> dict:
        """Open a native Save dialog, then download `url` from the local server
        and write the bytes to the chosen path. Avoids pushing large files
        through the JS bridge and avoids browser-download handling that
        WebView2 does not support inside pywebview."""
        try:
            target_path = self._prompt_save_path(suggested_name)
            if target_path is None:
                return {"ok": False, "cancelled": True}
            request = urllib.request.Request(url)
            with urllib.request.urlopen(request, timeout=600) as response:
                if getattr(response, "status", 200) >= 400:
                    return {"ok": False, "error": f"Server returned {response.status}."}
                data = response.read()
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(data)
            return {"ok": True, "path": str(target_path)}
        except Exception as exc:
            append_runtime_log(f"save_download_error {type(exc).__name__}: {exc}")
            return {"ok": False, "error": str(exc)}

    def save_file_as(self, suggested_name: str, base64_data: str) -> dict:
        try:
            target_path = self._prompt_save_path(suggested_name)
            if target_path is None:
                return {"ok": False, "cancelled": True}
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(base64.b64decode(base64_data))
            return {"ok": True, "path": str(target_path)}
        except Exception as exc:
            append_runtime_log(f"save_file_as_error {type(exc).__name__}: {exc}")
            return {"ok": False, "error": str(exc)}


def project_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parents[1]


PROJECT_ROOT = project_root()


def external_asset_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "assets"
    return PROJECT_ROOT / "frontend" / "public"


def runtime_data_root() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "FB Roster Editor"
        base.mkdir(parents=True, exist_ok=True)
        return base
    return PROJECT_ROOT / "backend" / "data"


def runtime_log_path() -> Path:
    return runtime_data_root() / "desktop_runtime.log"


def append_runtime_log(message: str) -> None:
    try:
        with runtime_log_path().open("a", encoding="utf-8") as handle:
            handle.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")
    except Exception:
        pass


def wait_for_server(timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{APP_URL}/api/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception as exc:  # pragma: no cover
            last_error = exc
            time.sleep(0.25)
    raise RuntimeError(f"Backend did not start in time: {last_error}")


def run_server(server: uvicorn.Server) -> None:
    try:
        server.run()
    except Exception as exc:
        append_runtime_log(f"server_error {type(exc).__name__}: {exc}")
        raise


def main() -> int:
    frontend_index = PROJECT_ROOT / "frontend" / "dist" / "index.html"
    if not frontend_index.exists():
        raise SystemExit(
            "Frontend build not found. Run `npm.cmd --prefix frontend run build` before launching desktop mode."
        )

    data_root = runtime_data_root()
    session_root = data_root / "sessions"
    session_root.mkdir(parents=True, exist_ok=True)
    os.environ["FB_EDITOR_BACKEND_ROOT"] = str(PROJECT_ROOT)
    os.environ["FB_EDITOR_PROJECT_ROOT"] = str(PROJECT_ROOT)
    os.environ["FB_EDITOR_FRONTEND_DIST"] = str(PROJECT_ROOT / "frontend" / "dist")
    os.environ["FB_EDITOR_DATA_ROOT"] = str(data_root)
    os.environ["FB_EDITOR_SESSION_ROOT"] = str(session_root)
    os.environ["FB_EDITOR_EXTERNAL_ASSET_ROOT"] = str(external_asset_root())
    os.environ["FB_EDITOR_PORTRAIT_ROOT"] = str(external_asset_root() / "Player_Portraits")
    append_runtime_log(
        f"startup project_root={PROJECT_ROOT} frontend_dist={PROJECT_ROOT / 'frontend' / 'dist'} "
        f"data_root={data_root} session_root={session_root} asset_root={external_asset_root()}"
    )

    from app.main import app as fastapi_app

    config = uvicorn.Config(
        fastapi_app,
        host=HOST,
        port=PORT,
        log_level="warning",
        log_config=None,
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=run_server, args=(server,), daemon=True)
    thread.start()
    try:
        wait_for_server()
    except Exception as exc:
        append_runtime_log(f"wait_for_server_error {type(exc).__name__}: {exc}")
        raise

    window = webview.create_window(
        APP_NAME,
        APP_URL,
        width=1600,
        height=1000,
        min_size=(1100, 720),
        text_select=True,
        js_api=DesktopApi(),
    )

    def shutdown() -> None:
        server.should_exit = True

    window.events.closed += shutdown
    try:
        webview.start()
        return 0
    except Exception as exc:
        append_runtime_log(f"webview_error {type(exc).__name__}: {exc}")
        raise


if __name__ == "__main__":
    sys.exit(main())
