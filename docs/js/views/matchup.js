// Matchup: hero, then my starters vs the opponent's starters side by side,
// then my bench with the start/sit what-if.
import { el } from '../util.js';
import { myMatchup } from '../model.js';
import { hero, lineupPanel } from '../ui/rows.js';
import { h2hPanel } from '../ui/h2h.js';

export function render(S, main) {
  const L = S.leagues[S.state.lg];
  main.appendChild(hero(S, L, k => { S.state.lg = k; S.render(); }));
  if (!L) return;
  const mm = myMatchup(L);
  if (!mm) { main.appendChild(el('div', 'empty', 'No matchup')); return; }
  const h = el('div', 'h'); h.appendChild(el('h2', null, 'Head to head')); h.appendChild(el('span', 'sub', L.platform === 'rtsports' ? 'Both sides scored live from NFL stats' : 'Sleeper live')); main.appendChild(h);
  main.appendChild(h2hPanel(S, L, mm));
  const h2 = el('div', 'h'); h2.appendChild(el('h2', null, 'My bench')); h2.appendChild(el('span', 'sub', 'Start buttons are a what-if')); main.appendChild(h2);
  main.appendChild(lineupPanel(S, L, mm.me, { title: mm.me.name, whatIf: true, startersHidden: true }));
}
