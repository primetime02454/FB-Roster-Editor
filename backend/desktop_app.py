from __future__ import annotations

import sys
import threading
import time
import urllib.request
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
PROJECT_ROOT = Path(__file__).resolve().parents[1]


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
    server.run()


def main() -> int:
    frontend_index = PROJECT_ROOT / "frontend" / "dist" / "index.html"
    if not frontend_index.exists():
        raise SystemExit(
            "Frontend build not found. Run `npm.cmd --prefix frontend run build` before launching desktop mode."
        )

    config = uvicorn.Config("app.main:app", host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=run_server, args=(server,), daemon=True)
    thread.start()
    wait_for_server()

    window = webview.create_window(
        "Madden Roster Editor",
        APP_URL,
        width=1600,
        height=1000,
        min_size=(1100, 720),
        text_select=True,
    )

    def shutdown() -> None:
        server.should_exit = True

    window.events.closed += shutdown
    webview.start()
    return 0


if __name__ == "__main__":
    sys.exit(main())
