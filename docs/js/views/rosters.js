// Rosters: every team in every league, starters then bench, scored live.
import { el } from '../util.js';
import { lineupPanel } from '../ui/rows.js';

export function render(S, main) {
  const f = S.state.rf || (S.state.rf = { lg: S.state.lg, team: null });
  const chips = el('div', 'chips');
  for (const k of ['SoFi', 'Y60', 'Boats']) { const b = el('button', 'chip', k); b.setAttribute('aria-pressed', String(f.lg === k)); b.onclick = () => { f.lg = k; f.team = null; S.render(); }; chips.appendChild(b); }
  main.appendChild(chips);
  const L = S.leagues[f.lg]; if (!L) { main.appendChild(el('div', 'empty', 'Not loaded')); return; }
  const teamId = f.team ?? L.me;
  const tc = el('div', 'chips');
  for (const id of L.order) { const T = L.byId[id]; const b = el('button', 'chip', T.name + (id === L.me ? ' (me)' : '')); b.setAttribute('aria-pressed', String(String(id) === String(teamId))); b.onclick = () => { f.team = id; S.render(); }; tc.appendChild(b); }
  main.appendChild(tc);
  const T = L.byId[teamId] || L.teams[0];
  const h = el('div', 'h'); h.appendChild(el('h2', null, T.name)); h.appendChild(el('span', 'sub', `${T.owner}  ${T.w}-${T.l}` + (T.faabLeft != null ? `  FAAB $${T.faabLeft}` : ''))); main.appendChild(h);
  main.appendChild(lineupPanel(S, L, T, { title: 'Starters', whatIf: String(T.id) === String(L.me) }));
}
