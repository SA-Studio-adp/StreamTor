// Continue watching: saved on the account when logged in, otherwise in this browser
const KEY = 'streamtor_progress';
const local = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const same = (a, b) => a.hash === b.hash && a.file === b.file;

export async function loadProgress(me) {
  if (me) { try { const r = await fetch('/api/progress'); if (r.ok) return await r.json(); } catch {} }
  return local();
}
export function saveProgress(me, e) {
  if (me) return fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) }).catch(() => {});
  localStorage.setItem(KEY, JSON.stringify([e, ...local().filter((x) => !same(x, e))].slice(0, 12)));
}
export async function removeProgress(me, e) {
  if (me) return fetch(`/api/progress/${e.hash}/${e.file}`, { method: 'DELETE' }).catch(() => {});
  localStorage.setItem(KEY, JSON.stringify(local().filter((x) => !same(x, e))));
}
