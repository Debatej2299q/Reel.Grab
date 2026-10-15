"""ReelGrab - a small Flask app that downloads public Instagram videos using yt-dlp."""

import os
import re
import shutil
import tempfile
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from flask import Flask, Response, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).parent
app = Flask(__name__, static_folder=str(BASE_DIR / "static"), static_url_path="/static")

ALLOWED_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com"}
HAS_FFMPEG = shutil.which("ffmpeg") is not None
COOKIE_FILE = os.environ.get("INSTAGRAM_COOKIES")  # optional path to a cookies.txt
RATE_LIMIT = int(os.environ.get("RATE_LIMIT_PER_MIN", "20"))

_hits = defaultdict(deque)
_lock = threading.Lock()


# ----------------------------------------------------------------- helpers
def rate_limited(ip: str) -> bool:
    now = time.time()
    with _lock:
        q = _hits[ip]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return True
        q.append(now)
        return False


def valid_instagram_url(url: str) -> bool:
    try:
        p = urlparse(url.strip())
    except ValueError:
        return False
    return p.scheme in ("http", "https") and (p.hostname or "").lower() in ALLOWED_HOSTS


def base_opts() -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 20,
        "retries": 3,
    }
    if COOKIE_FILE and Path(COOKIE_FILE).is_file():
        opts["cookiefile"] = COOKIE_FILE
    return opts


def friendly_error(exc: Exception) -> str:
    msg = str(exc).lower()
    if "login" in msg or "private" in msg or "rate-limit" in msg or "not available" in msg:
        return ("Instagram refused this request. The post may be private, removed, or "
                "Instagram wants a login. Try a public post, or configure cookies (see README).")
    if "unsupported url" in msg:
        return "That link isn't a downloadable Instagram post or reel."
    if "ffmpeg" in msg:
        return "ffmpeg is required for this option but isn't installed on the server."
    return "Couldn't fetch that video. Check the link and try again."


def safe_name(text: str, fallback: str = "instagram_video") -> str:
    text = re.sub(r"[^\w\- ]+", "", text or "", flags=re.UNICODE).strip()
    return (text[:60] or fallback).replace(" ", "_")


def pick_thumb(entry: dict) -> str:
    if entry.get("thumbnail"):
        return entry["thumbnail"]
    thumbs = entry.get("thumbnails") or []
    return thumbs[-1]["url"] if thumbs else ""


def summarize(entry: dict, index: int) -> dict:
    return {
        "index": index,
        "title": entry.get("title") or entry.get("description") or "Instagram video",
        "thumbnail": pick_thumb(entry),
        "uploader": entry.get("uploader") or entry.get("channel") or "",
        "duration": entry.get("duration"),
        "height": entry.get("height"),
        "is_video": entry.get("vcodec") not in (None, "none") or bool(entry.get("formats")),
    }


def quality_options(entries: list) -> list:
    heights = {f.get("height") for e in entries for f in (e.get("formats") or [])
               if f.get("height") and f.get("vcodec") not in (None, "none")}
    top = max(heights) if heights else None
    opts = [{"id": "best", "label": "Best quality", "kind": "video"}]
    for h in (1080, 720, 480):
        if top and h < top:
            opts.append({"id": str(h), "label": f"{h}p", "kind": "video"})
    if HAS_FFMPEG:
        opts.append({"id": "mp3", "label": "Audio only (MP3)", "kind": "audio"})
    return opts


def format_selector(quality: str) -> str:
    if quality == "best":
        return "bv*+ba/b" if HAS_FFMPEG else "b"
    h = int(quality)
    if HAS_FFMPEG:
        return f"bv*[height<={h}]+ba/b[height<={h}]/b"
    return f"b[height<={h}]/b"


# ------------------------------------------------------------------ routes
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    return jsonify(ok=True, ffmpeg=HAS_FFMPEG, yt_dlp=yt_dlp.version.__version__)


@app.post("/api/info")
def info():
    if rate_limited(request.remote_addr or "?"):
        return jsonify(error="Too many requests. Please wait a minute."), 429
    url = ((request.get_json(silent=True) or {}).get("url") or "").strip()
    if not valid_instagram_url(url):
        return jsonify(error="Please paste a valid instagram.com link."), 400

    try:
        opts = {**base_opts(), "skip_download": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            data = ydl.extract_info(url, download=False)
    except Exception as exc:  # yt-dlp raises many types
        return jsonify(error=friendly_error(exc)), 422

    entries = [e for e in (data.get("entries") or []) if e] or [data]
    return jsonify(
        items=[summarize(e, i + 1) for i, e in enumerate(entries)],
        options=quality_options(entries),
        source=url,
    )


@app.get("/api/download")
def download():
    if rate_limited(request.remote_addr or "?"):
        return jsonify(error="Too many requests. Please wait a minute."), 429
    url = request.args.get("url", "").strip()
    quality = request.args.get("quality", "best")
    try:
        item = max(1, int(request.args.get("item", "1")))
    except ValueError:
        item = 1

    if not valid_instagram_url(url):
        return jsonify(error="Please paste a valid instagram.com link."), 400
    if quality not in {"best", "1080", "720", "480", "mp3"}:
        return jsonify(error="Unknown quality option."), 400
    if quality == "mp3" and not HAS_FFMPEG:
        return jsonify(error="MP3 needs ffmpeg, which isn't installed on this server."), 400

    tmp = tempfile.mkdtemp(prefix="reelgrab_")
    opts = {
        **base_opts(),
        "outtmpl": os.path.join(tmp, "%(id)s.%(ext)s"),
        "playlist_items": str(item),
        "max_filesize": 500 * 1024 * 1024,
    }
    if quality == "mp3":
        opts["format"] = "ba/b"
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}
        ]
    else:
        opts["format"] = format_selector(quality)
        if HAS_FFMPEG:
            opts["merge_output_format"] = "mp4"

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            data = ydl.extract_info(url, download=True)
        files = [p for p in Path(tmp).iterdir() if p.is_file()]
        if not files:
            raise RuntimeError("No file was produced")
        path = max(files, key=lambda p: p.stat().st_size)
    except Exception as exc:
        shutil.rmtree(tmp, ignore_errors=True)
        return jsonify(error=friendly_error(exc)), 422

    entry = (data.get("entries") or [data])[0] if data else {}
    name = safe_name(entry.get("title") if entry else "") + path.suffix
    def stream():
        # Stream the file, then always delete the temp folder (works on every OS)
        try:
            with open(path, "rb") as fh:
                while True:
                    chunk = fh.read(1024 * 1024)
                    if not chunk:
                        break
                    yield chunk
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    mime = "audio/mpeg" if path.suffix == ".mp3" else "video/mp4"
    resp = Response(stream(), mimetype=mime)
    resp.headers.set("Content-Disposition", "attachment", filename=name)
    resp.headers["Content-Length"] = str(path.stat().st_size)
    return resp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("DEBUG") == "1")
