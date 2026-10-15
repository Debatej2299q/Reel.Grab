# ReelGrab

A clean web app for downloading **public** Instagram videos (reels, posts, carousels) in the quality you choose. Built with Flask and [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Features
- Paste a link, preview the video, pick quality (Best / 1080p / 720p / 480p / MP3 audio)
- Carousel posts: choose which video to download
- Dark glassmorphism UI, mobile friendly
- Rate limiting, Instagram-only URL validation, temp files cleaned after every download

## Run locally
```bash
git clone https://github.com/<you>/reelgrab.git
cd reelgrab
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
Open http://localhost:5000.

Install [ffmpeg](https://ffmpeg.org/download.html) to enable merged high-quality video and MP3 extraction (without it the app falls back to single-file formats and hides the MP3 option).

## Run with Docker
```bash
docker build -t reelgrab .
docker run -p 8000:8000 reelgrab
```

## Deploy
GitHub hosts your **code**, but GitHub Pages can only serve static files, so the Python backend must run elsewhere. Push this repo to GitHub, then connect it to a host:

- **Render**: New → Blueprint → select the repo (uses `render.yaml` and the Dockerfile).
- **Railway / Fly.io / Koyeb**: deploy from the repo; the Dockerfile is detected automatically.

## Instagram login / cookies
Instagram often blocks anonymous requests from datacenter IPs. If you see "Instagram refused this request":
1. Export your cookies with a browser extension to a Netscape-format `cookies.txt` (use a throwaway account).
2. Set the env var `INSTAGRAM_COOKIES=/path/to/cookies.txt`.

Never commit `cookies.txt` (it's in `.gitignore`).

## Keep yt-dlp fresh
Instagram changes often. If downloads break, update: `pip install -U yt-dlp` (or rebuild the Docker image).

## Configuration
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Server port |
| `RATE_LIMIT_PER_MIN` | `20` | Requests per IP per minute |
| `INSTAGRAM_COOKIES` | – | Path to cookies.txt |

## Responsible use
Only download content you own or have permission to save. Respect creators' copyright and Instagram's Terms of Use.
