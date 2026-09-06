// My Players: every player I own across the three leagues, grouped by
// position (QB, RB, WR, TE, K, DST). Position tabs on top narrow to one
// position; league chips and "Playing now" narrow further.
import { el, tag } from '../util.js';
import { myMatchup } from '../model.js';
import { playerRow, legendItem } from '../ui/rows.js';

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const posIdx = p => { const i = POS.indexOf(p); return i < 0 ? POS.length : i; };

export function render(S, main) {
  const f = S.state.pf || (S.state.pf = { pos: 'ALL', lg: 'ALL', live: false });
  const list = S.myPlayers();
  const gameOf = p => S.ctx.games.byTeam.get(p.slot.nfl);
  const isLive = p => gameOf(p)?.state === 'in';

  // position tabs (counts reflect the league / live filters)
  const base = list.filter(p => (f.lg === 'ALL' || p.owned.some(o => o.league.key === f.lg)) && (!f.live || isLive(p)));
  const ptabs = el('div', 'chips');
  for (const p of ['ALL', ...POS]) {
    const n = p === 'ALL' ? base.length : base.filter(x => x.slot.pos === p).length;
    const b = el('button', 'chip', p === 'ALL' ? `All ${n}` : `${p} ${n}`);
    b.setAttribute('aria-pressed', String(f.pos === p)); b.onclick = () => { f.pos = p; S.render(); };
    ptabs.appendChild(b);
  }
  main.appendChild(ptabs);
  const chips = el('div', 'chips');
  for (const k of ['ALL', 'SoFi', 'Y60', 'Boats']) { const b = el('button', 'chip', k === 'ALL' ? 'All leagues' : k); b.setAttribute('aria-pressed', String(f.lg === k)); b.onclick = () => { f.lg = k; S.render(); }; chips.appendChild(b); }
  const lv = el('button', 'chip hot', 'Playing now'); lv.setAttribute('aria-pressed', String(f.live)); lv.onclick = () => { f.live = !f.live; S.render(); }; chips.appendChild(lv);
  main.appendChild(chips);

  let rows = f.pos === 'ALL' ? base : base.filter(p => p.slot.pos === f.pos);
  const un = list.filter(p => p.slot.unmatched).length;
  if (un) { const b = el('div', 'banner'); b.appendChild(tag('warn', 'UNMATCHED')); b.appendChild(el('span', null, `${un} player(s) could not be linked to a stat feed`)); main.appendChild(b); }
  const h = el('div', 'h'); h.appendChild(el('h2', null, f.pos === 'ALL' ? 'My players' : `My ${f.pos}s`)); h.appendChild(el('span', 'sub', `${rows.length} shown, ${list.filter(isLive).length} playing now`)); main.appendChild(h);

  // position first, then live, then upcoming by kickoff, then final, then name
  const rank = p => { const st = gameOf(p)?.state; return st === 'in' ? 0 : st === 'pre' ? 1 : st === 'post' ? 2 : 3; };
  rows.sort((a, b) => posIdx(a.slot.pos) - posIdx(b.slot.pos) || rank(a) - rank(b)
    || (rank(a) === 1 ? new Date(gameOf(a)?.kickoff) - new Date(gameOf(b)?.kickoff) : 0) || a.slot.name.localeCompare(b.slot.name));

  const panel = el('section', 'panel'); const ul = el('ul', 'rows');
  let lastPos = null;
  for (const p of rows) {
    if (f.pos === 'ALL' && p.slot.pos !== lastPos) {
      lastPos = p.slot.pos;
      const g = el('li', 'grp'); g.appendChild(el('span', null, lastPos)); g.appendChild(el('span', 'n', `${rows.filter(x => x.slot.pos === lastPos).length}`));
      ul.appendChild(g);
    }
    const o = p.owned; const first = { league: o[0].league, ctx: S.ctx, matchup: myMatchup(o[0].league)?.m, onOpen: S.openPlayer };
    if (o[1]) first.second = { league: o[1].league, ctx: S.ctx, matchup: myMatchup(o[1].league)?.m };
    const li = playerRow(S, p.slot, first);
    li.querySelector('.slot').appendChild(el('small', null, o.map(x => x.league.key + (x.slot.starter ? '' : ' bn')).join(' ')));
    ul.appendChild(li);
  }
  if (!rows.length) ul.appendChild(el('li', 'empty', f.live ? 'No games in progress' : 'No players match'));
  panel.appendChild(ul);
  const lg = el('div', 'legend'); lg.append(legendItem('o', 'Live now'), legendItem('b', 'Up vs projection'), legendItem('g', 'Final')); panel.appendChild(lg);
  main.appendChild(panel);
}
