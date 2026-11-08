# StreamTor
Needs Node 18+ and ffmpeg (for MKV/AVI playback). Get a free TMDB key at themoviedb.org.

Development (two terminals):
  cd server && npm install && TMDB_API_KEY=your_key npm start
  cd web && npm install && npm run dev        # open http://localhost:5173

Production (one server):
  cd web && npm install && npm run build
  cd ../server && TMDB_API_KEY=your_key npm start   # open http://localhost:3000
