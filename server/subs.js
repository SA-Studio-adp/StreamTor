import express from 'express';
import { run, inputUrl, shiftVtt } from './ff.js';

const KEY = process.env.OPENSUBTITLES_API_KEY || '';
const API = 'https://api.opensubtitles.com/api/v1';
const H = { 'Api-Key': KEY, 'User-Agent': 'StreamTor v2', 'Content-Type': 'application/json' };
const toVtt = (s) => 'WEBVTT\n\n' + s.replace(/\r/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(e.status || 500).json({ error: e.message }));
let token;

async function login() {
  if (token) return token;
  const r = await fetch(API + '/login', { method: 'POST', headers: H, body: JSON.stringify({ username: process.env.OPENSUBTITLES_USER, password: process.env.OPENSUBTITLES_PASS }) });
  if (!r.ok) throw new Error('OpenSubtitles login failed. Check OPENSUBTITLES_USER and OPENSUBTITLES_PASS.');
  return (token = (await r.json()).token);
}

export const subs = (getTorrent) => {
  const r = express.Router();

  // Subtitle files shipped inside the torrent (.srt or .vtt)
  r.get('/file/:hash/:i', wrap(async (req, res) => {
    const f = (await getTorrent(req.params.hash))?.files[+req.params.i];
    if (!f || !/\.(srt|vtt)$/i.test(f.name) || f.length > 2e6) return res.sendStatus(404);
    const chunks = [];
    for await (const c of f.createReadStream()) chunks.push(c);
    const text = Buffer.concat(chunks).toString('utf8');
    res.type('text/vtt').send(shiftVtt(/\.vtt$/i.test(f.name) ? text : toVtt(text), +req.query.shift || 0));
  }));

  r.get('/search', wrap(async (req, res) => {
    if (!KEY) throw Object.assign(new Error('Set OPENSUBTITLES_API_KEY to search OpenSubtitles.'), { status: 503 });
    const u = new URL(API + '/subtitles');
    u.search = new URLSearchParams({ query: String(req.query.q || ''), languages: String(req.query.lang || 'en') });
    const d = await (await fetch(u, { headers: H })).json();
    const results = (d.data || []).map((s) => ({ id: s.attributes.files?.[0]?.file_id, name: s.attributes.release || s.attributes.feature_details?.title, lang: s.attributes.language })).filter((s) => s.id).slice(0, 8);
    res.json({ results });
  }));

  r.get('/os/:id', wrap(async (req, res) => {
    const post = async () => fetch(API + '/download', { method: 'POST', headers: { ...H, Authorization: `Bearer ${await login()}` }, body: JSON.stringify({ file_id: +req.params.id }) });
    let r1 = await post();
    if (r1.status === 401) { token = null; r1 = await post(); }
    if (!r1.ok) throw new Error('OpenSubtitles download failed (daily quota may be used up).');
    const { link } = await r1.json();
    res.type('text/vtt').send(shiftVtt(toVtt(await (await fetch(link)).text()), +req.query.shift || 0));
  }));
  // Text subtitles embedded in the video file. ffmpeg reads the whole file to collect every cue.
  const cache = new Map();
  r.get('/embedded/:hash/:i/:s', wrap(async (req, res) => {
    const key = `${req.params.hash}/${req.params.i}/${req.params.s}`;
    if (!cache.has(key)) cache.set(key, run('ffmpeg', ['-v', 'error', '-i', inputUrl(req.params.hash, req.params.i), '-map', `0:s:${+req.params.s}`, '-f', 'webvtt', 'pipe:1']).catch((e) => { cache.delete(key); throw e; }));
    res.type('text/vtt').send(shiftVtt(await cache.get(key), +req.query.shift || 0));
  }));
  return r;
};
