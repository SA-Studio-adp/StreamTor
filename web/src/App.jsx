import { useEffect, useRef, useState } from 'react';
import { Auth, Library, Donate, Faq } from './pages.jsx';
import Subs, { label } from './subs.jsx';
import { loadProgress, saveProgress, removeProgress } from './progress.js';

const IMG = 'https://image.tmdb.org/t/p/';
const MEDIA = /\.(mp4|webm|m4v|mkv|avi|mov|mp3|flac|ogg|wav|m4a)$/i;
const NATIVE = /\.(mp4|webm|m4v|mp3|flac|ogg|wav|m4a)$/i;

const fmt = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i];
};

const api = async (url, opt) => {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [me, setMe] = useState(null);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); }, []);
  const h = useHash();
  const m = h.match(/^#\/t\/([0-9a-f]{40})/i);
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); setMe(null); location.hash = '#/'; };
  let page = <Home me={me} />;
  if (m) page = <Torrent key={m[1]} hash={m[1].toLowerCase()} me={me} />;
  else if (h === '#/login') page = <Auth onAuth={setMe} />;
  else if (h === '#/library') page = <Library me={me} />;
  else if (h === '#/donate') page = <Donate />;
  else if (h === '#/faq') page = <Faq />;
  return (
    <>
      <header className="bar">
        <a href="#/" className="logo">StreamTor</a>
        <nav>
          <a href="#/faq">FAQ</a>
          <a href="#/donate">Donate</a>
          {me ? <><a href="#/library">Library</a><button className="ghost" onClick={logout}>Log out</button></> : <a href="#/login">Log in</a>}
          <button className="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        </nav>
      </header>
      <main>{page}</main>
      <footer>
        You are responsible for the content you load. This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </>
  );
}

function Home({ me }) {
  const [magnet, setMagnet] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recent, setRecent] = useState([]);
  useEffect(() => { loadProgress(me).then(setRecent); }, [me]);
  const resumeItem = async (e) => {
    setErr('');
    try {
      await api('/api/torrents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ magnet: e.magnet }) });
      location.hash = `#/t/${e.hash}?f=${e.file}&t=${Math.floor(e.position)}`;
    } catch (x) { setErr(x.message); }
  };
  const drop = async (e) => { await removeProgress(me, e); setRecent((r) => r.filter((x) => x !== e)); };

  const go = async (opt) => {
    setBusy(true);
    setErr('');
    try {
      const t = await api('/api/torrents', opt);
      location.hash = '#/t/' + t.hash;
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };
  const submit = (e) => {
    e.preventDefault();
    go({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ magnet }) });
  };
  const upload = (e) => {
    const f = e.target.files[0];
    if (f) go({ method: 'POST', headers: { 'Content-Type': 'application/x-bittorrent' }, body: f });
  };

  return (
    <section className="hero">
      <h1>Paste a link. Press play.</h1>
      <p>Stream or download any torrent in your browser. No ads, no speed limits, no sign-up.</p>
      <form onSubmit={submit} className="paste">
        <input value={magnet} onChange={(e) => setMagnet(e.target.value)} placeholder="magnet:?xt=urn:btih:..." required aria-label="Magnet link" />
        <button disabled={busy}>{busy ? 'Finding peers...' : 'Start streaming'}</button>
      </form>
      <label className="ghost file">
        Open a .torrent file
        <input type="file" accept=".torrent" hidden onChange={upload} />
      </label>
      {err && <p className="err">{err}</p>}
      {recent.length > 0 && (
        <div className="recent">
          <h2>Continue watching</h2>
          <ul>
            {recent.map((e) => (
              <li key={e.hash + e.file}>
                {e.poster ? <img src={IMG + 'w185' + e.poster} alt="" /> : <div className="noimg" />}
                <b>{e.title}</b>
                <small>{e.fileName}</small>
                <progress value={e.position} max={e.duration || 1} />
                <div className="row"><button onClick={() => resumeItem(e)}>Resume</button><button className="ghost" onClick={() => drop(e)}>Remove</button></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="feats">
        <li><b>Instant playback</b>Streaming starts from the first bytes.</li>
        <li><b>Plays MKV and AVI</b>Converted on the fly for your browser.</li>
        <li><b>ZIP download</b>Get the whole torrent or one folder.</li>
        <li><b>Posters and details</b>Matched automatically from TMDB.</li>
      </ul>
    </section>
  );
}

function Torrent({ hash, me }) {
  const [t, setT] = useState(null);
  const [meta, setMeta] = useState(null);
  const [cur, setCur] = useState(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [err, setErr] = useState('');
  const [tracks, setTracks] = useState([]);
  const [note, setNote] = useState('');
  const [info, setInfo] = useState(null); // tracks found inside the file; false if unreadable
  const [audio, setAudio] = useState(null);
  const [resume, setResume] = useState(0);
  const vid = useRef(null);
  const lastSave = useRef(0);
  const params = useRef(new URLSearchParams(location.hash.split('?')[1] || ''));

  useEffect(() => {
    let on = true;
    const load = () => api('/api/torrents/' + hash).then((d) => on && setT(d)).catch((e) => on && setErr(e.message));
    load();
    const id = setInterval(load, 3000);
    return () => { on = false; clearInterval(id); };
  }, [hash]);

  useEffect(() => {
    if (t?.name) api('/api/tmdb/match?name=' + encodeURIComponent(t.name)).then(setMeta).catch(() => setMeta(false));
  }, [t?.name]);

  // Opened from "Continue watching": jump to the saved file and position
  useEffect(() => {
    if (!t || cur || !params.current.has('f')) return;
    const f = t.files[+params.current.get('f')];
    if (f) { setCur(f); setResume(+params.current.get('t') || 0); }
    params.current = new URLSearchParams();
  }, [t]);

  useEffect(() => {
    setInfo(null); setAudio(null); setTracks([]);
    if (cur) api(`/api/probe/${hash}/${cur.index}`).then(setInfo).catch(() => setInfo(false));
  }, [cur]);

  const search = async (e) => {
    e.preventDefault();
    const d = await api('/api/tmdb/search?q=' + encodeURIComponent(q)).catch(() => ({ results: [] }));
    setRes(d.results);
  };

  const title = meta?.title || meta?.name || t?.name;
  const base = info?.audio?.find((a) => a.default)?.index ?? 0;
  const aSel = audio ?? base;
  // Browsers can only play a file's default audio, so any other track goes through the converter
  const transcoding = !!cur && (!NATIVE.test(cur.name) || aSel !== base);
  const ready = cur && (NATIVE.test(cur.name) || info !== null);
  const src = ready && (transcoding ? `/api/transcode/${hash}/${cur.index}?a=${aSel}&t=${Math.floor(resume)}` : `/api/stream/${hash}/${cur.index}`);
  const pos = () => (transcoding ? resume : 0) + (vid.current?.currentTime || 0);
  const pickAudio = (i) => { setResume(pos()); setAudio(i); };

  const track = () => {
    const d = info?.duration, p = pos();
    if (!d || p < 15 || Date.now() - lastSave.current < 10000) return;
    lastSave.current = Date.now();
    const e = { hash, magnet: t.magnet, file: cur.index, fileName: cur.name, title, poster: meta?.poster_path || '', position: p, duration: d };
    p / d > 0.95 ? removeProgress(me, e) : saveProgress(me, e);
  };

  const save = async () => {
    if (!me) { location.hash = '#/login'; return; }
    try {
      await api('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hash, name: title, magnet: t.magnet }) });
      setNote('Saved to library');
    } catch (e) { setNote(e.message); }
  };

  if (err) return <p className="err">{err}</p>;
  if (!t) return <p className="muted">Loading torrent...</p>;

  return (
    <div className="grid">
      <aside>
        <div className="card meta">
          {meta?.poster_path && <img src={IMG + 'w342' + meta.poster_path} alt="" />}
          <h2>{title}</h2>
          {meta && <small>{(meta.release_date || meta.first_air_date || '').slice(0, 4)}, rated {meta.vote_average?.toFixed(1)}</small>}
          {meta?.overview && <p>{meta.overview}</p>}
        </div>
        <form className="card" onSubmit={search}>
          <label htmlFor="q">Wrong match? Search TMDB</label>
          <div className="row">
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title" required />
            <button>Search</button>
          </div>
          <ul className="results">
            {res.map((r) => (
              <li key={r.id}>
                <button type="button" className="ghost" onClick={() => { setMeta(r); setRes([]); }}>
                  {r.title || r.name} ({(r.release_date || r.first_air_date || '').slice(0, 4)})
                </button>
              </li>
            ))}
          </ul>
        </form>
      </aside>
      <section>
        {cur && !src && <p className="muted">Reading the tracks in this file...</p>}
        {src && (
          <>
            <video ref={vid} key={src} controls autoPlay src={src} poster={meta?.backdrop_path ? IMG + 'w780' + meta.backdrop_path : undefined}
              onLoadedMetadata={(e) => { if (!transcoding && resume) e.currentTarget.currentTime = resume; }}
              onTimeUpdate={track} onPause={() => { lastSave.current = 0; track(); }}>
              {tracks.map((k) => {
                const s = k.src + (transcoding && resume ? `?shift=${Math.floor(resume)}` : '');
                return <track key={s} kind="subtitles" src={s} label={k.label} srcLang={/^[a-z]{2}$/.test(k.lang) ? k.lang : undefined} default={k === tracks[tracks.length - 1]} />;
              })}
            </video>
            {transcoding && <p className="muted">This file is converted live, so seeking is limited.</p>}
            {info?.audio?.length > 1 && (
              <div className="card row">
                <label htmlFor="aud">Audio</label>
                <select id="aud" value={aSel} onChange={(e) => pickAudio(+e.target.value)}>
                  {info.audio.map((a) => <option key={a.index} value={a.index}>{label(a)}</option>)}
                </select>
              </div>
            )}
            <Subs hash={hash} cur={cur} files={t.files} title={title} info={info} tracks={tracks} setTracks={setTracks} />
          </>
        )}
        <div className="stats">
          <span>{fmt(t.size)}</span><span>{(t.progress * 100).toFixed(1)}% downloaded</span>
          <span>{fmt(t.speed)}/s</span><span>{t.peers} peers</span>
          <button className="ghost" onClick={save}>{note || 'Save to library'}</button>
          <a className="btn" href={`/api/zip/${hash}`}>Download all as ZIP</a>
        </div>
        <ul className="files">
          {t.files.map((f) => (
            <li key={f.index} className={cur?.index === f.index ? 'on' : ''}>
              <span title={f.path}>{f.name}</span>
              <small>{fmt(f.size)}</small>
              {MEDIA.test(f.name) && <button onClick={() => { setCur(f); setResume(0); }}>Play</button>}
              <a className="ghost" href={`/api/stream/${hash}/${f.index}`} download={f.name}>Download</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
