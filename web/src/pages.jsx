import { useEffect, useState } from 'react';
import { DONATE } from './config.js';

const call = async (url, opt) => {
  const r = await fetch(url, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
};
const post = (url, body) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      onAuth(await post('/api/auth/' + mode, { email, password }));
      location.hash = '#/library';
    } catch (x) {
      setErr(x.message);
    }
  };
  const login = mode === 'login';
  return (
    <section className="narrow">
      <h1>{login ? 'Log in' : 'Create your account'}</h1>
      <p className="muted">An account keeps your library of saved torrents. Streaming never needs one.</p>
      <form onSubmit={submit} className="stack">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required autoComplete="email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" minLength={8} required autoComplete={login ? 'current-password' : 'new-password'} />
        <button>{login ? 'Log in' : 'Create account'}</button>
      </form>
      {err && <p className="err">{err}</p>}
      <button className="ghost" onClick={() => setMode(login ? 'register' : 'login')}>{login ? 'New here? Create an account' : 'Have an account? Log in'}</button>
    </section>
  );
}

export function Library({ me }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { call('/api/library').then(setItems).catch((e) => setErr(e.message)); }, [me]);
  const open = async (i) => {
    try { location.hash = '#/t/' + (await post('/api/torrents', { magnet: i.magnet })).hash; } catch (e) { setErr(e.message); }
  };
  const remove = async (i) => setItems(await call('/api/library/' + i.hash, { method: 'DELETE' }));
  if (err) return <p className="err">{err} <a href="#/login">Log in</a></p>;
  if (!items) return <p className="muted">Loading...</p>;
  return (
    <section className="narrow">
      <h1>Your library</h1>
      {items.length === 0 ? <p className="muted">Nothing saved yet. Open a torrent and choose Save to library.</p> : (
        <ul className="files">
          {items.map((i) => (
            <li key={i.hash}><span>{i.name}</span><button onClick={() => open(i)}>Open</button><button className="ghost" onClick={() => remove(i)}>Remove</button></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Donate() {
  return (
    <section className="narrow">
      <h1>Keep StreamTor free</h1>
      <p>StreamTor has no ads and no speed limits, and donating doesn't change that: everyone gets the same service. Donations pay for servers and bandwidth.</p>
      <div className="stack">
        {DONATE.map((d) => <a key={d.label} className="btn" href={d.url} target="_blank" rel="noreferrer">Donate with {d.label}</a>)}
      </div>
    </section>
  );
}

const FAQ = [
  ['Is my IP address visible to other peers?', 'Peers see the StreamTor server, not you. Your connection to StreamTor uses HTTPS, so your internet provider sees only that you visited this site.'],
  ['Do I need a VPN?', 'Not to hide your address from the torrent swarm, since the server handles all peer traffic. Use one if you want to hide your visit to this site itself.'],
  ['Which formats can I play?', 'MP4, WebM, MP3, FLAC and similar play directly. MKV, AVI and other formats are converted live, which makes seeking limited.'],
  ['How do subtitles work?', 'Subtitle files inside the torrent can be added directly. You can also search OpenSubtitles by language. Turn them on with the CC button in the player.'],
  ['Do I need an account?', 'No. An account only lets you save torrents to a library so you can reopen them later.'],
  ['Are there ads or speed limits?', 'No. Speed depends on the swarm, the server load, and your connection.'],
  ['What happens to downloaded data?', 'The server stores it on disk while it streams. Clear the downloads folder on your server whenever you need space.'],
  ['Who is responsible for the content?', 'You are. StreamTor only transfers what you ask it to load.'],
];

export function Faq() {
  return (
    <section className="narrow">
      <h1>Questions and answers</h1>
      {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
    </section>
  );
}
