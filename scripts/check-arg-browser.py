"""Run ARG browser checks with installed Edge; artifacts stay in build/arg-browser/."""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'build/arg-browser'
EDGE = Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}
    def log_message(self, *args):
        pass

def main():
    profile = FOLDER / f'profile-{time.time_ns()}'
    profile.mkdir(parents=True, exist_ok=True)
    port_file = profile / 'DevToolsActivePort'
    if port_file.exists():
        port_file.unlink()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with (FOLDER / 'browser.log').open('w', encoding='utf-8') as log:
            browser = subprocess.Popen([str(EDGE), '--headless=new', '--disable-gpu', '--no-first-run',
                '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
                '--disable-sync', '--remote-debugging-port=0', f'--user-data-dir={profile}', 'about:blank'],
                stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            try:
                deadline = time.monotonic() + 15
                while not port_file.exists():
                    if time.monotonic() > deadline:
                        raise RuntimeError('Edge remote debugging did not start')
                    time.sleep(.1)
                port = int(port_file.read_text().splitlines()[0])
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                with opener.open(f'http://127.0.0.1:{port}/json/version', timeout=5) as response:
                    endpoint = json.load(response)['webSocketDebuggerUrl']
                subprocess.run(['node', str(ROOT / 'scripts/check-arg-browser.mjs'), endpoint,
                    f'http://127.0.0.1:{server.server_port}', str(FOLDER)], cwd=ROOT, check=True, timeout=120)
            finally:
                browser.terminate()
                try:
                    browser.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    browser.kill()
                    browser.wait()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
