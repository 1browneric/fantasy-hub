// My Players: every player I own across the three leagues, one card each,
// both point totals where two leagues own him. Filter by league and live.
import { el, tag } from '../util.js';
import { myMatchup } from '../model.js';
import { playerRow, legendItem } from '../ui/rows.js';

export function render(S, main) {
  const f = S.state.pf || (S.state.pf = { lg: 'ALL', live: false });
  const chips = el('div', 'chips');
  for (const k of ['ALL', 'SoFi', 'Y60', 'Boats']) { const b = el('button', 'chip', k === 'ALL' ? 'All' : k); b.setAttribute('aria-pressed', String(f.lg === k)); b.onclick = () => { f.lg = k; S.render(); }; chips.appendChild(b); }
  const lv = el('button', 'chip hot', 'Playing now'); lv.setAttribute('aria-pressed', String(f.live)); lv.onclick = () => { f.live = !f.live; S.render(); }; chips.appendChild(lv);
  main.appendChild(chips);
  const list = S.myPlayers();   // [{slot, leagues:[{league, slot}]}]
  let rows = list;
  if (f.lg !== 'ALL') rows = rows.filter(p => p.owned.some(o => o.league.key === f.lg));
  if (f.live) rows = rows.filter(p => S.ctx.games.byTeam.get(p.slot.nfl)?.state === 'in');
  const un = list.filter(p => p.slot.unmatched).length;
  if (un) { const b = el('div', 'banner'); b.appendChild(tag('warn', 'UNMATCHED')); b.appendChild(el('span', null, `${un} player(s) could not be linked to a stat feed`)); main.appendChild(b); }
  const h = el('div', 'h'); h.appendChild(el('h2', null, 'My players')); h.appendChild(el('span', 'sub', `${rows.length} shown, ${list.filter(p => S.ctx.games.byTeam.get(p.slot.nfl)?.state === 'in').length} playing now`)); main.appendChild(h);
  const panel = el('section', 'panel'); const ul = el('ul', 'rows');
  const rank = p => { const st = S.ctx.games.byTeam.get(p.slot.nfl)?.state; return st === 'in' ? 0 : st === 'pre' ? 1 : st === 'post' ? 2 : 3; };
  rows.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? new Date(S.ctx.games.byTeam.get(a.slot.nfl)?.kickoff) - new Date(S.ctx.games.byTeam.get(b.slot.nfl)?.kickoff) : 0) || a.slot.name.localeCompare(b.slot.name));
  for (const p of rows) {
    const o = p.owned; const first = { league: o[0].league, ctx: S.ctx, matchup: myMatchup(o[0].league)?.m, onOpen: S.openPlayer };
    if (o[1]) first.second = { league: o[1].league, ctx: S.ctx, matchup: myMatchup(o[1].league)?.m };
    const li = playerRow(S, p.slot, first);
    if (!o[1]) li.querySelector('.slot').appendChild(el('small', null, o[0].league.key));
    ul.appendChild(li);
  }
  if (!rows.length) ul.appendChild(el('li', 'empty', f.live ? 'No games in progress' : 'No players match'));
  panel.appendChild(ul);
  const lg = el('div', 'legend'); lg.append(legendItem('o', 'Live now'), legendItem('b', 'Up vs projection'), legendItem('g', 'Final')); panel.appendChild(lg);
  main.appendChild(panel);
}
