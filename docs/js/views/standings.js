// Standings: one table per league. Record, points for and against, FAAB.
import { el, f1 } from '../util.js';

export function render(S, main) {
  for (const k of ['SoFi', 'Y60', 'Boats']) {
    const L = S.leagues[k]; if (!L) continue;
    const h = el('div', 'h'); h.appendChild(el('h2', null, L.name)); h.appendChild(el('span', 'sub', `${L.teams.length} teams, week ${L.week}` + (L.platform === 'rtsports' ? ', RT guest data' : ''))); main.appendChild(h);
    const panel = el('section', 'panel'); const sc = el('div', 'scroll');
    const t = el('table', 'tbl'); const th = el('thead'); const tr = el('tr');
    for (const c of ['', 'Team', 'W-L', 'PF', L.pa !== null && L.platform === 'sleeper' ? 'PA' : '', L.faab ? 'FAAB' : '']) if (c !== '' || tr.children.length === 0) tr.appendChild(el('th', c === 'PF' || c === 'PA' || c === 'FAAB' || c === 'W-L' ? 'n' : null, c));
    th.appendChild(tr); t.appendChild(th);
    const tb = el('tbody');
    L.order.forEach((id, i) => {
      const T = L.byId[id]; const r = el('tr', String(id) === String(L.me) ? 'me' : null);
      r.appendChild(el('td', 'rk', T.rank ? String(T.rank) : '-'));
      const tm = el('td'); const cell = el('div', 'tm');
      if (T.logo) { const img = el('img'); img.src = T.logo; img.alt = ''; img.onerror = () => img.remove(); cell.appendChild(img); }
      const nb = el('div'); nb.appendChild(el('b', null, T.name + (String(id) === String(L.me) ? '  ME' : ''))); nb.appendChild(el('small', null, T.owner)); cell.appendChild(nb); tm.appendChild(cell); r.appendChild(tm);
      r.appendChild(el('td', 'n', `${T.w}-${T.l}${T.t ? '-' + T.t : ''}`));
      r.appendChild(el('td', 'n', f1(T.pf)));
      if (L.platform === 'sleeper') r.appendChild(el('td', 'n dim', f1(T.pa)));
      if (L.faab) r.appendChild(el('td', 'n dim', '$' + T.faabLeft));
      tb.appendChild(r);
    });
    t.appendChild(tb); sc.appendChild(t); panel.appendChild(sc);
    if (!L.teams.some(T => T.w + T.l > 0)) panel.appendChild(el('div', 'note', 'Preseason: records populate after the first game.'));
    main.appendChild(panel);
  }
}
