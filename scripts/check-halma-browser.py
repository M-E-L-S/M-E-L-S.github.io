"""Real UI and Worker/Wasm checks using installed Edge; all artifacts stay in build/."""
import functools
import http.server
from pathlib import Path
import subprocess
import threading
import time
import urllib.request
from urllib.parse import urlsplit
import os
import socket
import sys

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'build/halma-browser'
EDGE = Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')

class Handler(http.server.SimpleHTTPRequestHandler):
    legacy_components = b''
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript'}
    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/scripts/fixtures/picker-cache/':
            body = b'<!doctype html><html><head><link rel="stylesheet" href="/src/styles/components.css"></head><body>Cached legacy CSS</body></html>'
            mime, cache = 'text/html; charset=utf-8', 'no-store'
        elif url.path == '/src/styles/components.css' and not url.query:
            body = self.legacy_components
            mime, cache = 'text/css; charset=utf-8', 'public, max-age=3600'
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', cache)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass

def main():
    online_test = '--online' in sys.argv
    folder = ROOT / ('build/halma-online-browser' if online_test else 'build/halma-browser')
    folder.mkdir(parents=True, exist_ok=True)
    FOLDER.mkdir(parents=True, exist_ok=True)
    # Emulate a returning browser retaining the pre-fix unversioned import.
    Handler.legacy_components = subprocess.run(['git', 'show', 'HEAD:src/styles/components.css'], cwd=ROOT, capture_output=True, check=True).stdout
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = folder / 'profile'
    profile.mkdir(exist_ok=True)
    port_file = profile / 'DevToolsActivePort'
    if port_file.exists():
        port_file.unlink()
    helpers = []
    with (folder / 'browser.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen([str(EDGE), '--headless=new', '--disable-gpu', '--no-first-run',
            '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
            '--disable-sync', '--remote-debugging-port=0', f'--user-data-dir={profile}', 'about:blank'],
            stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            extra = []
            if online_test:
                origin = f'http://127.0.0.1:{server.server_port}'
                netlify = subprocess.Popen(['node', str(ROOT / 'scripts/halma-online-server.mjs'), origin], cwd=ROOT,
                    stdout=subprocess.PIPE, stderr=log, text=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                helpers.append(netlify)
                import json
                netlify_port = json.loads(netlify.stdout.readline())['port']
                with socket.socket() as probe:
                    probe.bind(('127.0.0.1', 0))
                    cf_port = probe.getsockname()[1]
                env = {**os.environ, 'WRANGLER_SEND_METRICS': 'false', 'WRANGLER_LOG_PATH': str(folder / 'wrangler.log')}
                cf = subprocess.Popen(['node', str(ROOT / 'mels-api/node_modules/wrangler/bin/wrangler.js'), 'dev', '--local',
                    '--ip', '127.0.0.1', '--port', str(cf_port), '--persist-to', str(folder / 'cloudflare-state'), '--log-level', 'error'],
                    cwd=ROOT / 'mels-api', env=env, stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                helpers.append(cf)
                until_cf = time.monotonic() + 30
                while True:
                    try:
                        urllib.request.urlopen(f'http://127.0.0.1:{cf_port}/api/halma/rooms/' + 'a' * 20, timeout=1)
                        break
                    except urllib.error.HTTPError:
                        break
                    except (OSError, urllib.error.URLError):
                        if time.monotonic() > until_cf or cf.poll() is not None:
                            raise RuntimeError('Local Cloudflare runtime did not start; see browser.log')
                        time.sleep(.1)
                extra = [str(cf_port), str(netlify_port)]
            until = time.monotonic() + 20
            while not port_file.exists():
                if time.monotonic() > until or process.poll() is not None:
                    raise RuntimeError('Headless Edge failed to start; see build/halma-browser/browser.log')
                time.sleep(.1)
            port, path = port_file.read_text().splitlines()[:2]
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=5) as response:
                (folder / 'devtools.json').write_bytes(response.read())
            driver = 'check-halma-online-browser.mjs' if online_test else 'check-halma-browser.mjs'
            result = subprocess.run(['node', str(ROOT / 'scripts' / driver), f'ws://127.0.0.1:{port}{path}',
                f'http://127.0.0.1:{server.server_port}', str(folder), *extra], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=180,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            (folder / 'check.log').write_text(result.stdout + result.stderr, encoding='utf-8')
            print(result.stdout + result.stderr, flush=True)
            result.check_returncode()
        finally:
            for helper in helpers:
                if helper.poll() is None:
                    subprocess.run(['taskkill', '/PID', str(helper.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                    helper.wait(timeout=10)
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            server.shutdown()
            server.server_close()

if __name__ == '__main__':
    main()
