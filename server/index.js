import express from 'express';
import WebTorrent from 'webtorrent';
import archiver from 'archiver';
import mime from 'mime-types';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { auth, library, progress } from './auth.js';
import { run, inputUrl } from './ff.js';
import { subs } from './subs.js';

const PORT = process.env.PORT || 3000;
const TMDB = process.env.TMDB_API_KEY || '';
const DIR = process.env.DOWNLOAD_DIR || './downloads';
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../web/dist');

// No ads, no throttling: WebTorrent runs with unlimited speeds by default.
const client = new WebTorrent({ downloadLimit: -1, uploadLimit: -1 });
const app = express();
app.use(express.json());
app.use(express.static(WEB));

const getTorrent = async (hash) => client.get(hash);
app.use('/api/auth', auth);
app.use('/api/library', library);
app.use('/api/progress', progress);
app.use('/api/subs', subs(getTorrent));

async function addTorrent(src) {
  try {
    return await new Promise((resolve, reject) => {
      const t = client.add(src, { path: DIR });
      t.once('ready', () => resolve(t));
      t.once('error', reject);
    });
  } catch (e) {
    const h = /[0-9a-f]{40}/i.exec(e.message)?.[0];
    const existing = h && (await client.get(h.toLowerCase()));
    if (existing?.ready) return existing;
    throw e;
  }
}

const info = (t) => ({
  hash: t.infoHash, name: t.name, magnet: t.magnetURI, size: t.length, progress: t.progress,
  speed: t.downloadSpeed, peers: t.numPeers,
  files: t.files.map((f, i) => ({ index: i, name: f.name, path: f.path, size: f.length, type: mime.lookup(f.name) || 'application/octet-stream' })),
});

// Add a magnet link (JSON {magnet}) or a .torrent file (raw body)
app.post('/api/torrents', express.raw({ type: 'application/x-bittorrent', limit: '10mb' }), async (req, res) => {
  const src = Buffer.isBuffer(req.body) && req.body.length ? req.body : req.body?.magnet;
  if (!src) return res.status(400).json({ error: 'Send a magnet link or a .torrent file.' });
  try {
    res.json(info(await addTorrent(src)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/torrents/:hash', async (req, res) => {
  const t = await getTorrent(req.params.hash);
  t ? res.json(info(t)) : res.status(404).json({ error: 'Torrent not found. Add it again from the home page.' });
});

// Streaming with HTTP range support: playback starts from the first bytes
app.get('/api/stream/:hash/:i', async (req, res) => {
  const f = (await getTorrent(req.params.hash))?.files[+req.params.i];
  if (!f) return res.sendStatus(404);
  const type = mime.lookup(f.name) || 'application/octet-stream';
  const range = req.headers.range;
  if (!range) {
    res.set({ 'Content-Length': f.length, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
    const s = f.createReadStream();
    res.on('close', () => s.destroy());
    return s.pipe(res);
  }
  const [a, b] = range.replace('bytes=', '').split('-');
  const start = +a, end = b ? +b : f.length - 1;
  res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${f.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': type });
  const s = f.createReadStream({ start, end });
  res.on('close', () => s.destroy());
  s.pipe(res);
});

// On-the-fly transcoding to fragmented MP4. ?a= picks the audio track, ?t= the start time in seconds.
app.get('/api/transcode/:hash/:i', async (req, res) => {
  const f = (await getTorrent(req.params.hash))?.files[+req.params.i];
  if (!f) return res.sendStatus(404);
  const t = Math.max(0, +req.query.t || 0);
  res.set('Content-Type', 'video/mp4');
  const ff = spawn('ffmpeg', ['-v', 'error', ...(t ? ['-ss', String(t)] : []), '-i', inputUrl(req.params.hash, req.params.i), '-map', '0:v:0?', '-map', `0:a:${+req.query.a || 0}?`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1']);
  ff.on('error', () => res.end());
  ff.stdout.pipe(res);
  res.on('close', () => ff.kill('SIGKILL'));
});

// Lists the audio and subtitle tracks inside a file (needs ffprobe)
app.get('/api/probe/:hash/:i', async (req, res) => {
  try {
    const j = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', inputUrl(req.params.hash, req.params.i)], 60000));
    const of = (type) => j.streams.filter((s) => s.codec_type === type).map((s, index) => ({ index, lang: s.tags?.language || 'und', title: s.tags?.title || '', codec: s.codec_name, channels: s.channels, default: !!s.disposition?.default }));
    const bitmap = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub'];
    res.json({ duration: +j.format?.duration || 0, audio: of('audio'), subs: of('subtitle').map((s) => ({ ...s, text: !bitmap.includes(s.codec) })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ZIP the whole torrent, or one folder with ?folder=path
app.get('/api/zip/:hash', async (req, res) => {
  const t = await getTorrent(req.params.hash);
  if (!t) return res.sendStatus(404);
  const folder = req.query.folder || '';
  res.attachment(`${path.basename(folder) || t.name}.zip`);
  const zip = archiver('zip', { store: true });
  zip.on('error', () => res.end());
  zip.pipe(res);
  for (const f of t.files.filter((f) => f.path.startsWith(folder))) zip.append(f.createReadStream(), { name: f.path });
  zip.finalize();
});

// TMDB: metadata for posters, titles and overviews
async function tmdb(p, params = {}) {
  if (!TMDB) throw Object.assign(new Error('Set TMDB_API_KEY to enable TMDB.'), { status: 503 });
  const u = new URL('https://api.themoviedb.org/3' + p);
  const bearer = TMDB.length > 40; // v4 read token vs v3 key
  u.search = new URLSearchParams(bearer ? params : { api_key: TMDB, ...params });
  const r = await fetch(u, bearer ? { headers: { Authorization: `Bearer ${TMDB}` } } : {});
  if (!r.ok) throw Object.assign(new Error('TMDB error ' + r.status), { status: 502 });
  return r.json();
}

function parseName(n) {
  const s = n.replace(/[._]/g, ' ');
  const y = /^(.*?)[\s(\[]*((?:19|20)\d{2})(?=[\s)\]]|$)/.exec(s);
  const title = (y ? y[1] : s.replace(/\b(S\d{1,2}E?\d*|\d{3,4}p|4k|x26[45]|bluray|web-?dl|webrip|hdrip)\b.*$/i, '')).trim();
  return { title, year: y?.[2], tv: /\bS\d{1,2}(E\d+)?\b/i.test(s) };
}

const tmdbRoute = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

app.get('/api/tmdb/match', tmdbRoute(async (req) => {
  const { title, year, tv } = parseName(String(req.query.name || ''));
  const d = await tmdb(tv ? '/search/tv' : '/search/movie', { query: title, ...(year && { [tv ? 'first_air_date_year' : 'year']: year }) });
  return d.results[0] || false;
}));

app.get('/api/tmdb/search', tmdbRoute(async (req) => {
  const d = await tmdb('/search/multi', { query: String(req.query.q || '') });
  return { results: d.results.filter((r) => r.media_type !== 'person').slice(0, 6) };
}));

app.listen(PORT, () => console.log(`StreamTor running on http://localhost:${PORT}`));
