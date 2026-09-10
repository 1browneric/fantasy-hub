// Home: the hero matchup, one card per league, my games right now, the
// presented-by insight, and a standings strip.
import { el, f1, headshot, teamLogo, paintTeam, tag, pct } from '../util.js';
import { summarize, winProb, myMatchup, scoreSlot, effectiveSlots } from '../model.js';
import { hero, ordinal, gameText } from '../ui/rows.js';
import { gameChip } from './nfl.js';
import { standingBlock } from './pickem.js';

export function render(S, main) {
  main.appendChild(hero(S, S.leagues[S.state.lg], k => { S.state.lg = k; S.render(); }));

  const h = el('div', 'h'); h.appendChild(el('h2', null, 'My teams')); h.appendChild(el('span', 'sub', `NFL week ${S.state.week}`)); main.appendChild(h);
  const cards = el('div', 'lgcards');
  for (const k of ['SoFi', 'Y60', 'Boats']) {
    const L = S.leagues[k];
    const card = el('button', 'lgcard');
    if (!L) { card.appendChild(el('div', 'k', k + ': not loaded')); cards.appendChild(card); continue; }
    const mm = myMatchup(L);
    const kk = el('div', 'k'); kk.appendChild(el('span', 'lg', L.name));
    const me = L.byId[L.me];
    const rk = el('span', 'rk'); rk.appendChild(el('b', null, me ? `${me.w}-${me.l}` : '--')); rk.append(me?.rank ? `  ${ordinal(me.rank)} of ${L.teams.length}` : `  ${L.teams.length} teams`);
    kk.appendChild(rk); card.appendChild(kk);
    if (mm) {
      const A = summarize(L, mm.me, S.ctx, mm.m), B = summarize(L, mm.opp, S.ctx, mm.m);
      const top = A.rows.slice().sort((x, y) => y.projFinal - x.projFinal)[0]?.slot.nfl; paintTeam(card, S.T, top);
      const m = el('div', 'm');
      const a = el('div'); const an = el('div', 'n', mm.me.name); an.appendChild(el('small', null, 'ME')); a.appendChild(an); a.appendChild(el('div', 's' + (A.pts < B.pts ? ' trail' : ''), f1(A.pts))); m.appendChild(a);
      m.appendChild(el('div', 'vs', 'VS'));
      const b = el('div', 'r'); const bn = el('div', 'n', mm.opp.name); bn.appendChild(el('small', null, `${mm.opp.w}-${mm.opp.l}`)); b.appendChild(bn); b.appendChild(el('div', 's' + (B.pts < A.pts ? ' trail' : ''), f1(B.pts))); m.appendChild(b);
      card.appendChild(m);
      const f = el('div', 'f');
      const l = el('span'); l.append('proj '); l.appendChild(el('b', null, f1(A.projFinal))); l.append(' to '); l.appendChild(el('b', null, f1(B.projFinal))); f.appendChild(l);
      const wpa = Math.round(winProb(A, B) * 100);
      const r = el('span'); r.append('win '); r.appendChild(el('b', null, wpa + '%')); r.append(' to '); r.appendChild(el('b', null, (100 - wpa) + '%')); r.append(` est.  ${A.yet} to play`); f.appendChild(r);
      card.appendChild(f);
      const heads = el('div', 'heads');
      for (const row of A.rows.slice(0, 9)) heads.appendChild(headshot(S.T, row.slot.pid, row.slot.name, row.slot.nfl, 'sm'));
      card.appendChild(heads);
    } else card.appendChild(el('div', 'f', 'No matchup this week'));
    card.onclick = () => { S.state.lg = k; S.go('matchup'); };
    cards.appendChild(card);
  }
  main.appendChild(cards);

  // my games right now
  const mine = S.myGames();
  const h2 = el('div', 'h'); h2.appendChild(el('h2', null, 'My games')); h2.appendChild(el('span', 'sub', `${mine.filter(x => x.g.state === 'in').length} live of ${mine.length}`)); main.appendChild(h2);
  const grid = el('div', 'games');
  for (const { g, names } of mine.slice(0, 8)) grid.appendChild(gameChip(S, g, names));
  if (!mine.length) grid.appendChild(el('div', 'empty', 'No games on the slate for your players'));
  main.appendChild(grid);
  const more = el('button', 'chip', 'All NFL games'); more.style.marginTop = '10px'; more.onclick = () => S.go('nfl'); main.appendChild(more);

  // pick'em: the standing only; the picks stay on their own tab
  if (S.pickem) for (const n of standingBlock(S, undefined, () => S.go('pickem'))) main.appendChild(n);


  const h3 = el('div', 'h'); h3.appendChild(el('h2', null, 'Standings')); main.appendChild(h3);
  const strip = el('div', 'lgcards');
  for (const k of ['SoFi', 'Y60', 'Boats']) {
    const L = S.leagues[k]; if (!L) continue;
    const me = L.byId[L.me];
    const c = el('button', 'lgcard'); paintTeam(c, S.T, S.state.lg === k ? undefined : undefined);
    const kk = el('div', 'k'); kk.appendChild(el('span', 'lg', L.name));
    const rk = el('span', 'rk'); rk.appendChild(el('b', null, me?.rank ? ordinal(me.rank) : 'Preseason')); rk.append(me ? `  ${me.w}-${me.l}  ${f1(me.pf)} PF` : ''); kk.appendChild(rk);
    c.appendChild(kk);
    const f = el('div', 'f'); const leader = L.byId[L.order[0]]; f.appendChild(el('span', null, leader ? `Leader: ${leader.name} ${leader.w}-${leader.l}` : '')); if (L.faab) f.appendChild(el('span', null, `FAAB left $${me?.faabLeft ?? '--'}`)); c.appendChild(f);
    c.onclick = () => S.go('standings'); strip.appendChild(c);
  }
  main.appendChild(strip);
}
