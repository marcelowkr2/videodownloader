#!/usr/bin/env python3
"""Agente local: executa o yt-dlp no seu computador a pedido do site.

Escuta apenas em 127.0.0.1 e só aceita pedidos de origens autorizadas.
"""
import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

VERSION = "1.0.0"
PORT = int(os.environ.get("YTDLP_AGENT_PORT", "47890"))
ALLOWED_ORIGINS = {
    "https://videodownloader.infosystema.cloud",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
HOME = Path.home().resolve()
MAX_RUNNING = 3
JOB_TTL = 3600

VIDEO_FORMATS = {"mp4", "mkv"}
AUDIO_FORMATS = {"mp3", "m4a", "opus", "wav"}
RESOLUTIONS = {"best", "2160", "1440", "1080", "720", "480"}

jobs = {}
jobs_lock = threading.Lock()


def find_ytdlp():
    override = os.environ.get("YTDLP_BIN")
    if override:
        return override
    local = HOME / ".local" / "bin" / "yt-dlp"
    if local.exists():
        return str(local)
    return shutil.which("yt-dlp")


def is_youtube_url(value):
    try:
        url = urlparse(value)
    except ValueError:
        return False
    if url.scheme not in ("http", "https"):
        return False
    host = (url.hostname or "").lower().removeprefix("www.")
    if host == "youtu.be":
        return len([p for p in url.path.split("/") if p]) == 1
    if host not in ("youtube.com", "m.youtube.com", "music.youtube.com"):
        return False
    if url.path == "/watch":
        return bool(parse_qs(url.query).get("v"))
    return re.match(r"^/(shorts|embed|live)/[^/]+", url.path) is not None


def resolve_destination(raw):
    raw = raw.strip()
    if raw == "$HOME":
        path = HOME
    elif raw.startswith("$HOME/"):
        path = HOME / raw[len("$HOME/"):]
    else:
        path = Path(raw)
    path = Path(os.path.normpath(path))
    try:
        rel = path.relative_to(HOME)
    except ValueError:
        raise ValueError("A pasta precisa estar dentro da sua pasta pessoal.")
    if any(part.startswith(".") for part in rel.parts):
        raise ValueError("Pastas ocultas não são permitidas.")
    path.mkdir(parents=True, exist_ok=True)
    if not path.resolve().is_relative_to(HOME):
        raise ValueError("A pasta precisa estar dentro da sua pasta pessoal.")
    return path


def friendly_error(stderr):
    if re.search(r"private|unavailable|removed|not available", stderr, re.I):
        return "Vídeo privado ou indisponível."
    if re.search(r"ffmpeg|ffprobe", stderr, re.I):
        return "O ffmpeg não está instalado. Rode: sudo apt install ffmpeg"
    if re.search(r"sign in|confirm you.re not", stderr, re.I):
        return "O YouTube pediu login para este vídeo."
    return "Não foi possível baixar este vídeo."


def build_args(ytdlp, job, url, mode, resolution, fmt, playlist):
    args = [
        ytdlp,
        "--yes-playlist" if playlist else "--no-playlist",
        "--no-warnings",
        "--newline",
        "--progress-template", "download:PROGRESS %(progress._percent_str)s",
        "-o", str(job["dir"] / "%(title).120B.%(ext)s"),
    ]
    if shutil.which("node"):
        args += ["--js-runtimes", "node"]
    if mode == "audio":
        args += ["-x", "--audio-format", fmt]
    else:
        selector = "bv*+ba/b" if resolution == "best" else (
            f"bv*[height<={resolution}]+ba/b[height<={resolution}]"
        )
        args += ["-f", selector, "--merge-output-format", fmt]
    return args + ["--", url]


def run_job(job, args):
    stderr = ""
    try:
        proc = subprocess.Popen(
            args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace"
        )
        err_chunks = []
        reader = threading.Thread(target=lambda: err_chunks.extend(proc.stderr), daemon=True)
        reader.start()
        for line in proc.stdout:
            match = re.match(r"^PROGRESS\s+([\d.]+)%", line.strip())
            if match:
                job["progress"] = min(99.0, float(match.group(1)))
            elif "[Merger]" in line or "[ExtractAudio]" in line:
                job["message"] = "Finalizando arquivo…"
        proc.wait()
        reader.join(timeout=2)
        stderr = "".join(err_chunks)[-2000:]
        code = proc.returncode
    except OSError:
        job.update(status="error", message="Não foi possível executar o yt-dlp.")
        return
    if code == 0:
        job.update(status="done", progress=100.0, message="Pronto!")
    else:
        job.update(status="error", message=friendly_error(stderr))


class Handler(BaseHTTPRequestHandler):
    server_version = "ytdlp-agent"

    def log_message(self, *_args):
        pass

    def _allowed(self):
        return (
            self.headers.get("Origin") in ALLOWED_ORIGINS
            and self.headers.get("Host") in ALLOWED_HOSTS
        )

    def _send(self, status, body=None):
        data = json.dumps(body).encode() if body is not None else b""
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204 if self._allowed() else 403)

    def do_GET(self):
        if not self._allowed():
            return self._send(403, {"error": "Origem não autorizada."})
        path = urlparse(self.path).path
        if path == "/health":
            return self._send(200, {"ok": True, "version": VERSION, "ytdlp": find_ytdlp() is not None})
        match = re.fullmatch(r"/download/([0-9a-f-]{36})", path)
        job = jobs.get(match.group(1)) if match else None
        if not job:
            return self._send(404, {"error": "Download não encontrado."})
        self._send(200, {
            "status": job["status"],
            "progress": job["progress"],
            "message": job["message"],
            "path": job["display_path"],
        })

    def do_POST(self):
        if not self._allowed():
            return self._send(403, {"error": "Origem não autorizada."})
        if urlparse(self.path).path != "/download":
            return self._send(404, {"error": "Não encontrado."})
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self._send(415, {"error": "Content-Type inválido."})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 4096:
                raise ValueError
            payload = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "Requisição inválida."})

        url = str(payload.get("url", "")).strip()
        mode = "audio" if payload.get("mode") == "audio" else "video"
        resolution = str(payload.get("resolution", "best"))
        fmt = str(payload.get("format", ""))
        if not is_youtube_url(url):
            return self._send(400, {"error": "Link do YouTube inválido."})
        if resolution not in RESOLUTIONS:
            return self._send(400, {"error": "Resolução inválida."})
        if fmt not in (AUDIO_FORMATS if mode == "audio" else VIDEO_FORMATS):
            return self._send(400, {"error": "Formato inválido."})
        ytdlp = find_ytdlp()
        if not ytdlp:
            return self._send(500, {"error": "yt-dlp não encontrado no computador."})
        try:
            dest = resolve_destination(str(payload.get("destination", "")))
        except (ValueError, OSError) as error:
            return self._send(400, {"error": str(error)})

        with jobs_lock:
            now = time.time()
            for key in [k for k, j in jobs.items() if now - j["created"] > JOB_TTL and j["status"] != "running"]:
                del jobs[key]
            if sum(1 for j in jobs.values() if j["status"] == "running") >= MAX_RUNNING:
                return self._send(503, {"error": "Muitos downloads em andamento."})
            job_id = str(uuid.uuid4())
            rel = dest.relative_to(HOME)
            job = {
                "status": "running", "progress": 0.0, "message": "Baixando…", "dir": dest,
                "display_path": "~" if not rel.parts else f"~/{rel}", "created": now,
            }
            jobs[job_id] = job
        args = build_args(ytdlp, job, url, mode, resolution, fmt, bool(payload.get("playlist")))
        threading.Thread(target=run_job, args=(job, args), daemon=True).start()
        self._send(202, {"id": job_id})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Agente yt-dlp {VERSION} em http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
