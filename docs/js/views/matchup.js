// Matchup: the hero plus my full lineup with the start/sit what-if, and the
// opponent's lineup scored live from the same feeds.
import { el } from '../util.js';
import { myMatchup } from '../model.js';
import { hero, lineupPanel } from '../ui/rows.js';

export function render(S, main) {
  const L = S.leagues[S.state.lg];
  main.appendChild(hero(S, L, k => { S.state.lg = k; S.render(); }));
  if (!L) return;
  const mm = myMatchup(L);
  if (!mm) { main.appendChild(el('div', 'empty', 'No matchup')); return; }
  const h = el('div', 'h'); h.appendChild(el('h2', null, 'My lineup')); h.appendChild(el('span', 'sub', 'Tap a player for detail. Start buttons are a what-if.')); main.appendChild(h);
  main.appendChild(lineupPanel(S, L, mm.me, { title: mm.me.name, whatIf: true }));
  const h2 = el('div', 'h'); h2.appendChild(el('h2', null, 'Opponent')); h2.appendChild(el('span', 'sub', L.platform === 'rtsports' ? 'Scored live from NFL stats' : 'Sleeper live')); main.appendChild(h2);
  main.appendChild(lineupPanel(S, L, mm.opp, { title: mm.opp.name, bench: false }));
}
