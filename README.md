# StreamTor v2
Needs Node 18+ and ffmpeg (for MKV/AVI playback).

Environment variables (all optional):
  TMDB_API_KEY            posters and details (free at themoviedb.org)
  OPENSUBTITLES_API_KEY, OPENSUBTITLES_USER, OPENSUBTITLES_PASS   subtitle search (free account at opensubtitles.com)
  SESSION_SECRET          keeps logins valid across restarts
  DATA_FILE               where accounts are stored (default ./data.json)

Donate links: edit web/src/config.js.

Development (two terminals):
  cd server && npm install && npm start
  cd web && npm install && npm run dev        # http://localhost:5173

Production (one server):
  cd web && npm install && npm run build
  cd ../server && npm start                   # http://localhost:3000

Audio and embedded subtitle selection use ffprobe, which ships with ffmpeg.
Continue watching saves to your account when logged in, otherwise to the browser.
