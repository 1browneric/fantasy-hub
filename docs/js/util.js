// Small DOM + formatting helpers shared by every view.
export const $ = s => document.querySelector(s);
export const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};
export const f1 = v => (v == null ? '--' : (Math.round(v * 10) / 10).toFixed(1));
export const f2 = v => (v == null ? '--' : (Math.round(v * 100) / 100).toFixed(2));
export const pct = v => Math.round(v * 100) + '%';
const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
export const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[.'`’\-]/g, ' ').replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w && !SUFFIX.has(w)).join(' ');
const ALIAS = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
export const normTeam = t => ALIAS[(t || '').toUpperCase()] || (t || '').toUpperCase();
export const fmtKick = iso => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
export const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Team identity: paint --tp / --ts on any element so children can use them.
export function paintTeam(node, T, abbr) {
  const t = T[abbr];
  if (t) { node.style.setProperty('--tp', t.primary); node.style.setProperty('--ts', t.secondary); }
  return node;
}
// Team logo with a shield fallback in the team's colours (never a broken image).
export function teamLogo(T, abbr, size) {
  const t = T[abbr];
  const cls = size ? ' ' + size : '';
  if (!t) return paintTeam(el('span', 'shield' + cls, abbr || '?'), T, abbr);
  const img = el('img', 'tlogo' + cls);
  img.src = t.logo; img.alt = t.name; img.loading = 'lazy'; img.decoding = 'async';
  img.onerror = () => img.replaceWith(paintTeam(el('span', 'shield' + cls, abbr), T, abbr));
  return img;
}
// Player headshot from Sleeper's CDN; falls back to initials on team colours.
export function headshot(T, pid, name, abbr, size) {
  const cls = 'head' + (size ? ' ' + size : '');
  const fb = () => {
    const s = paintTeam(el('span', cls + ' fb', (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()), T, abbr);
    return s;
  };
  if (!pid || /^[A-Z]{2,3}$/.test(pid)) {
    // team defense: use the logo inside the circle
    const wrap = paintTeam(el('span', cls + ' fb'), T, abbr);
    wrap.appendChild(teamLogo(T, abbr));
    return wrap;
  }
  const img = paintTeam(el('img', cls), T, abbr);
  img.src = `https://sleepercdn.com/content/nfl/players/thumb/${pid}.jpg`;
  img.alt = name || ''; img.loading = 'lazy'; img.decoding = 'async';
  img.onerror = () => img.replaceWith(fb());
  return img;
}
export const tag = (cls, txt) => el('span', 'tag ' + cls, txt);
