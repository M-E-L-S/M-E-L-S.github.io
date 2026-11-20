"""Serve the static WASM release on loopback, with browser thread isolation."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import webbrowser

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        self.send_header('Cache-Control','no-cache')
        super().end_headers()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8876);p.add_argument('--directory',default=str(Path(__file__).resolve().parents[1]/'web'));p.add_argument('--open',action='store_true');a=p.parse_args()
    from functools import partial
    with ThreadingHTTPServer(('127.0.0.1',a.port),partial(Handler,directory=a.directory)) as server:
        url=f'http://127.0.0.1:{a.port}/';print(url,flush=True)
        if a.open:webbrowser.open(url)
        try:server.serve_forever()
        except KeyboardInterrupt:pass
