import { useState } from 'react';

const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', ru: 'Russian', tr: 'Turkish', ar: 'Arabic', hi: 'Hindi' };
const ISO = { fre: 'fr', ger: 'de', chi: 'zh', dut: 'nl', cze: 'cs', gre: 'el', rum: 'ro', per: 'fa' };
const name = (c) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(ISO[c] || c); } catch { return c; } };
export const label = (s) => [name(s.lang), s.title, s.codec, s.channels && s.channels + ' ch'].filter(Boolean).join(', ');

export default function Subs({ hash, cur, files, title, info, tracks, setTracks }) {
  const [lang, setLang] = useState('en');
  const [found, setFound] = useState([]);
  const [msg, setMsg] = useState('');
  const add = (src, name, l) => setTracks((t) => (t.some((x) => x.src === src) ? t : [...t, { src, label: name, lang: l }]));

  const search = async () => {
    setMsg('Searching...');
    try {
      const r = await fetch(`/api/subs/search?lang=${lang}&q=${encodeURIComponent(title)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setFound(d.results);
      setMsg(d.results.length ? '' : 'No subtitles found for this title and language.');
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="card subs">
      <div className="row">
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Subtitle language">
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={search}>Find subtitles</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {info?.subs?.length > 0 && <p className="muted">Embedded subtitles are read from the whole file, so they can take a while on large files.</p>}
      <ul className="results">
        {info?.subs?.map((s) => s.text
          ? <li key={'e' + s.index}><button className="ghost" onClick={() => add(`/api/subs/embedded/${hash}/${cur.index}/${s.index}`, label(s), s.lang)}>Embedded: {label(s)}</button></li>
          : <li key={'e' + s.index} className="muted">Embedded: {label(s)} (image-based, can't be shown)</li>)}
        {files.filter((f) => /\.(srt|vtt)$/i.test(f.name)).map((f) => (
          <li key={f.index}><button className="ghost" onClick={() => add(`/api/subs/file/${hash}/${f.index}`, f.name, lang)}>From torrent: {f.name}</button></li>
        ))}
        {found.map((s) => (
          <li key={s.id}><button className="ghost" onClick={() => add(`/api/subs/os/${s.id}`, `${s.lang} ${s.name}`, s.lang)}>{s.name} ({s.lang})</button></li>
        ))}
      </ul>
      {tracks.length > 0 && <p className="muted">Turn subtitles on with the CC button in the player.</p>}
    </div>
  );
}
