#!/usr/bin/env python3
"""
Kriky Machine data server.

Local (lowest RAM on the ESP32 — plain HTTP):
  python server.py

Cloud (always on — HTTPS, a bit more RAM on device):
  npx vercel
  Then on the handheld: BROWSER -> SERVER -> your-project.vercel.app
  (port 443 / HTTPS is chosen automatically for vercel.app hosts)

Endpoints:
  GET /ping              -> ok
  GET /ask?q=python      -> plain text (max ~320 chars)
  GET /                  -> short help page
"""

from __future__ import annotations

import json
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "0.0.0.0"
PORT = 8080
MAX_CHARS = 320
UA = "KrikyServer/1.0 (educational; +https://localhost)"

_MATH_OK = re.compile(r"^[\d+\-*/().%\s]+$")


def _lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.4)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _ascii(s: str) -> str:
    out = []
    for c in s.replace("\n", " ").replace("\r", " "):
        o = ord(c)
        if 32 <= o < 127:
            out.append(c)
        elif o in (9, 10, 13):
            out.append(" ")
    return re.sub(r" +", " ", "".join(out)).strip()


def _try_math(q: str) -> str:
    s = q.strip().replace(" ", "")
    if len(s) < 3 or not _MATH_OK.match(s):
        return ""
    if s.strip("0123456789") == "":
        return ""
    try:
        v = eval(s, {"__builtins__": {}}, {})  # noqa: S307 — digits/ops only
    except Exception:
        return ""
    if isinstance(v, float) and v == int(v):
        v = int(v)
    return str(v)


def _wiki_query(q: str) -> str:
    u = q.strip()
    low = u.lower()
    for p in (
        "what is the ",
        "what is ",
        "what's ",
        "whats ",
        "who is ",
        "who's ",
        "whos ",
        "define ",
        "meaning of ",
        "tell me about ",
        "how many ",
    ):
        if low.startswith(p):
            u = u[len(p) :].strip()
            break
    return u or q.strip()


def _http_json(url: str, timeout: float = 10.0) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read(24000)
    return json.loads(raw.decode("utf-8", "replace"))


def _wiki_extract(q: str) -> str:
    term = _wiki_query(q)
    if not term:
        return ""
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": term,
            "gsrlimit": "1",
            "prop": "extracts",
            "exintro": "1",
            "explaintext": "1",
            "exchars": str(MAX_CHARS),
            "redirects": "1",
            "format": "json",
        }
    )
    url = "https://en.wikipedia.org/w/api.php?" + params
    try:
        data = _http_json(url)
    except Exception as err:
        print("wiki error:", err)
        return ""
    pages = (data.get("query") or {}).get("pages") or {}
    if not pages:
        # fallback: opensearch
        try:
            params2 = urllib.parse.urlencode(
                {
                    "action": "opensearch",
                    "search": term,
                    "limit": "1",
                    "namespace": "0",
                    "format": "json",
                }
            )
            data2 = _http_json(
                "https://en.wikipedia.org/w/api.php?" + params2
            )
            if isinstance(data2, list) and len(data2) > 2 and data2[2]:
                return _ascii(str(data2[2][0]))[:MAX_CHARS]
        except Exception as err:
            print("opensearch error:", err)
        return ""
    page = next(iter(pages.values()))
    text = page.get("extract") or page.get("title") or ""
    return _ascii(str(text))[:MAX_CHARS]


def answer(q: str) -> str:
    q = (q or "").strip()
    if not q:
        return "type a question"
    text = _try_math(q)
    if text:
        return text
    text = _wiki_extract(q)
    if text:
        return text
    return "no wiki page. try a shorter name"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code: int, body: bytes, ctype: str = "text/plain; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/ping":
            self._send(200, b"ok")
            return

        if path == "/ask":
            q = (qs.get("q") or qs.get("query") or [""])[0]
            try:
                text = answer(q)
            except Exception as err:
                text = "server error: " + str(err)[:80]
            # Keep payload tiny for ESP32 RAM.
            payload = _ascii(text)[:MAX_CHARS].encode("ascii", "ignore")
            self._send(200, payload or b"?")
            return

        if path == "/":
            lan = _lan_ip()
            html = (
                "<!doctype html><title>Kriky Server</title>"
                "<meta name=viewport content=width=device-width>"
                "<h2>Kriky Machine Server</h2>"
                "<p>Running. On the handheld, set SERVER to:</p>"
                "<p><b>%s</b> port <b>%d</b></p>"
                "<p>Try: <a href='/ask?q=python'>/ask?q=python</a></p>"
                "<p>Ping: <a href='/ping'>/ping</a></p>"
            ) % (lan, PORT)
            self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
            return

        self._send(404, b"not found")


def main() -> None:
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("usage: python server.py [port]")
            sys.exit(1)

    lan = _lan_ip()
    httpd = ThreadingHTTPServer((HOST, port), Handler)
    print("Kriky data server")
    print("  local:  http://127.0.0.1:%d/" % port)
    print("  LAN:    http://%s:%d/" % (lan, port))
    print("On the handheld BROWSER -> SERVER, enter IP: %s" % lan)
    print("(port %d is the default — leave blank if asked)" % port)
    print("Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
