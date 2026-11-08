import { useEffect, useState } from 'react';

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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  const m = useHash().match(/^#\/t\/([0-9a-f]{40})/i);
  return (
    <>
      <header className="bar">
        <a href="#/" className="logo">StreamTor</a>
        <button className="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>
      <main>{m ? <Torrent key={m[1]} hash={m[1].toLowerCase()} /> : <Home />}</main>
      <footer>
        You are responsible for the content you load. This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </>
  );
}

function Home() {
  const [magnet, setMagnet] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
      <ul className="feats">
        <li><b>Instant playback</b>Streaming starts from the first bytes.</li>
        <li><b>Plays MKV and AVI</b>Converted on the fly for your browser.</li>
        <li><b>ZIP download</b>Get the whole torrent or one folder.</li>
        <li><b>Posters and details</b>Matched automatically from TMDB.</li>
      </ul>
    </section>
  );
}

function Torrent({ hash }) {
  const [t, setT] = useState(null);
  const [meta, setMeta] = useState(null);
  const [cur, setCur] = useState(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [err, setErr] = useState('');

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

  const search = async (e) => {
    e.preventDefault();
    const d = await api('/api/tmdb/search?q=' + encodeURIComponent(q)).catch(() => ({ results: [] }));
    setRes(d.results);
  };

  if (err) return <p className="err">{err}</p>;
  if (!t) return <p className="muted">Loading torrent...</p>;

  const src = cur && `/api/${NATIVE.test(cur.name) ? 'stream' : 'transcode'}/${hash}/${cur.index}`;
  const transcoding = cur && !NATIVE.test(cur.name);

  return (
    <div className="grid">
      <aside>
        <div className="card meta">
          {meta?.poster_path && <img src={IMG + 'w342' + meta.poster_path} alt="" />}
          <h2>{meta?.title || meta?.name || t.name}</h2>
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
        {src && (
          <>
            <video key={src} controls autoPlay src={src} poster={meta?.backdrop_path ? IMG + 'w780' + meta.backdrop_path : undefined} />
            {transcoding && <p className="muted">This format is converted live, so seeking is limited.</p>}
          </>
        )}
        <div className="stats">
          <span>{fmt(t.size)}</span><span>{(t.progress * 100).toFixed(1)}% downloaded</span>
          <span>{fmt(t.speed)}/s</span><span>{t.peers} peers</span>
          <a className="btn" href={`/api/zip/${hash}`}>Download all as ZIP</a>
        </div>
        <ul className="files">
          {t.files.map((f) => (
            <li key={f.index} className={cur?.index === f.index ? 'on' : ''}>
              <span title={f.path}>{f.name}</span>
              <small>{fmt(f.size)}</small>
              {MEDIA.test(f.name) && <button onClick={() => setCur(f)}>Play</button>}
              <a className="ghost" href={`/api/stream/${hash}/${f.index}`} download={f.name}>Download</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
