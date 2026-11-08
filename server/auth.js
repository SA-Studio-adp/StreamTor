import crypto from 'crypto';
import fs from 'fs';
import express from 'express';

const FILE = process.env.DATA_FILE || './data.json';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DAY = 86400000;

const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: [] }; } };
const save = (d) => fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
const mac = (b) => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const sign = (p) => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return `${b}.${mac(b)}`; };
const verify = (tok = '') => {
  const [b, s] = tok.split('.');
  if (!s || s.length !== mac(b).length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(mac(b)))) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url'));
  return p.exp > Date.now() ? p : null;
};
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64);
const startSession = (res, u) => res.setHeader('Set-Cookie', `st=${sign({ id: u.id, exp: Date.now() + 30 * DAY })}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
const currentUser = (req) => {
  const p = verify(req.headers.cookie?.match(/(?:^|; )st=([^;]+)/)?.[1]);
  return p && load().users.find((u) => u.id === p.id);
};

export const auth = express.Router();

auth.post('/register', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
  const d = load();
  if (d.users.some((u) => u.email === email.toLowerCase())) return res.status(409).json({ error: 'That email already has an account. Log in instead.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const u = { id: crypto.randomUUID(), email: email.toLowerCase(), salt, pw: hashPw(password, salt).toString('hex'), library: [] };
  d.users.push(u);
  save(d);
  startSession(res, u);
  res.json({ email: u.email });
});

auth.post('/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const u = load().users.find((x) => x.email === email.toLowerCase());
  const ok = u && crypto.timingSafeEqual(hashPw(password, u.salt), Buffer.from(u.pw, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
  startSession(res, u);
  res.json({ email: u.email });
});

auth.post('/logout', (req, res) => { res.setHeader('Set-Cookie', 'st=; Max-Age=0; Path=/'); res.json({}); });
auth.get('/me', (req, res) => { const u = currentUser(req); res.json(u ? { email: u.email } : null); });

export const library = express.Router();
const requireUser = (req, res, next) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Log in to use your library.' });
  req.uid = u.id;
  next();
};
library.use(requireUser);
const mutate = (req, res, fn) => {
  const d = load();
  const u = d.users.find((x) => x.id === req.uid);
  fn(u);
  save(d);
  res.json(u.library);
};
library.get('/', (req, res) => res.json(load().users.find((x) => x.id === req.uid).library));
library.post('/', (req, res) => {
  const { hash, name, magnet } = req.body || {};
  if (!hash || !magnet) return res.status(400).json({ error: 'Missing torrent details.' });
  mutate(req, res, (u) => { if (!u.library.some((l) => l.hash === hash)) u.library.push({ hash, name, magnet }); });
});
library.delete('/:hash', (req, res) => mutate(req, res, (u) => { u.library = u.library.filter((l) => l.hash !== req.params.hash); }));

// Continue watching: last positions, newest first (max 12)
export const progress = express.Router();
progress.use(requireUser);
const mut = (req, res, fn) => {
  const d = load();
  const u = d.users.find((x) => x.id === req.uid);
  u.progress = fn(u.progress || []).slice(0, 12);
  save(d);
  res.json(u.progress);
};
progress.get('/', (req, res) => res.json(load().users.find((x) => x.id === req.uid).progress || []));
progress.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.hash || !b.magnet) return res.status(400).json({ error: 'Missing details.' });
  const e = { hash: String(b.hash), magnet: String(b.magnet), file: +b.file || 0, fileName: String(b.fileName || ''), title: String(b.title || ''), poster: String(b.poster || ''), position: +b.position || 0, duration: +b.duration || 0, updated: Date.now() };
  mut(req, res, (l) => [e, ...l.filter((x) => !(x.hash === e.hash && x.file === e.file))]);
});
progress.delete('/:hash/:file', (req, res) => mut(req, res, (l) => l.filter((x) => !(x.hash === req.params.hash && x.file === +req.params.file))));
