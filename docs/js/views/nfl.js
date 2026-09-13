// NFL: every game this week with logos, live score, clock, possession,
// red zone, and which of my players are in it.
import { el, teamLogo, paintTeam, tag, fmtKick, football } from '../util.js';

export function gameChip(S, g, names) {
  const c = el('button', 'game' + (g.state === 'in' ? ' live' : '') + (g.state === 'in' && g.redzone ? ' rz' : ''));
  c.type = 'button'; c.setAttribute('aria-label', `${g.away} at ${g.home}, open game`); c.onclick = () => S.openGame(g);
  c.style.setProperty('--tp', S.T[g.away]?.primary || '#333'); c.style.setProperty('--to', S.T[g.home]?.primary || '#777');
  const side = (abbr, score, other) => {
    const t = el('div', 't' + (g.state !== 'pre' && score < other ? ' trail' : ''));
    const ab = el('span', 'ab'); ab.appendChild(teamLogo(S.T, abbr, 'lg')); ab.append(abbr);
    if (g.state === 'in' && g.possession === abbr) {
      ab.appendChild(football());
      if (g.redzone) ab.appendChild(el('span', 'rz', 'RED ZONE'));
    }
    t.appendChild(ab); t.appendChild(el('span', 's', g.state === 'pre' ? '' : String(score)));
    return t;
  };
  c.appendChild(side(g.away, g.awayScore, g.homeScore));
  c.appendChild(side(g.home, g.homeScore, g.awayScore));
  // Right-aligned status: date, time and channel before kickoff; LIVE with
  // quarter and clock once it starts (scores sit on the team rows above);
  // FINAL when done.
  const st = el('div', 'st');
  if (g.state === 'in') { st.appendChild(tag('live', 'LIVE')); st.appendChild(el('span', 'clk', g.detail)); }
  else if (g.state === 'post') st.appendChild(tag('final', 'FINAL'));
  else { st.appendChild(el('span', null, fmtKick(g.kickoff))); if (g.broadcast) st.appendChild(el('span', 'tv', g.broadcast)); }
  c.appendChild(st);
  if (g.state === 'in' && g.down) c.appendChild(el('div', 'st sub', g.down));
  // the snap that just happened, called out when it put points on the board
  if (g.state === 'in' && g.lastPlay) {
    if (g.scored > 0) c.classList.add('score');
    const lp = el('div', 'lp' + (g.scored > 0 ? ' scored' : ''));
    if (g.scored > 0 && g.playType) lp.appendChild(el('span', 'lpt', g.playType));
    lp.append(g.lastPlay);
    c.appendChild(lp);
  }
  // how the points went on the board, in game order, the latest at the bottom;
  // a long list keeps its last few here and the sheet has all of them
  const plays = S.scoring[g.id]?.plays;
  if (g.state !== 'pre' && plays?.length) c.appendChild(scoringList(S, g, plays, 5));
  if (names?.length) { const m = el('div', 'mine'); for (const n of names) m.appendChild(el('span', null, n)); c.appendChild(m); }
  return c;
}
const KIND = p => {
  const k = p.kind.toUpperCase();
  if (k === 'TOUCHDOWN' && /(interception|fumble|blocked|punt return|kickoff return|kick return)/i.test(p.type)) return 'DEFENSIVE TD';
  if (k === 'FIELD GOAL' && /missed|no good|blocked/i.test(p.type)) return 'FIELD GOAL MISSED';
  return k || p.type.toUpperCase();
};
// Scoring plays as rows: the team's logo, what it was and when, the play,
// then the score after it with the scoring team's side in ink. `limit`
// keeps the newest N and says how many came before.
export function scoringList(S, g, plays, limit) {
  const box = el('div', 'scoring');
  const hd = el('div', 'sh');
  hd.appendChild(el('span', 'lab', 'Scoring'));
  hd.appendChild(el('span', 'col', g.away)); hd.appendChild(el('span', 'col', g.home));
  box.appendChild(hd);
  const shown = limit && plays.length > limit ? plays.slice(-limit) : plays;
  if (shown.length < plays.length) box.appendChild(el('div', 'more', `${plays.length - shown.length} earlier, open the game for all ${plays.length}`));
  let period = 0;
  for (const p of shown) {
    if (!limit && p.period !== period) { period = p.period; box.appendChild(el('div', 'q', period > 4 ? 'Overtime' : `${ordinalQ(period)} quarter`)); }
    box.appendChild(scoringRow(S, g, p, !!limit));
  }
  return box;
}
const ordinalQ = n => ['', '1st', '2nd', '3rd', '4th'][n] || `${n}th`;
export function scoringRow(S, g, p, stamp) {
  const r = el('div', 'sp' + (p.team === g.home ? ' hm' : ''));
  r.appendChild(teamLogo(S.T, p.team));
  const w = el('div', 'w');
  const k = el('div', 'k'); k.appendChild(el('b', null, KIND(p))); k.appendChild(el('span', null, (stamp ? (p.period > 4 ? 'OT ' : `Q${p.period} `) : '') + p.clock)); w.appendChild(k);
  w.appendChild(el('div', 'tx', p.text));
  if (p.drive) w.appendChild(el('div', 'dr', p.drive));
  r.appendChild(w);
  r.appendChild(el('span', 'sc' + (p.team === g.away ? ' on' : ''), String(p.awayScore)));
  r.appendChild(el('span', 'sc' + (p.team === g.home ? ' on' : ''), String(p.homeScore)));
  return r;
}
export function render(S, main) {
  const list = S.ctx.games.list;
  const live = list.filter(g => g.state === 'in').length;
  const h = el('div', 'h'); h.appendChild(el('h2', null, `NFL week ${S.state.week}`)); h.appendChild(el('span', 'sub', `${live} live, ${list.filter(g => g.state === 'post').length} final, ${list.length} games`)); main.appendChild(h);
  const mine = Object.fromEntries(S.myGames().map(x => [x.g.id, x.names]));
  const order = g => g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2;
  const grid = el('div', 'games');
  for (const g of [...list].sort((a, b) => order(a) - order(b) || new Date(a.kickoff) - new Date(b.kickoff))) grid.appendChild(gameChip(S, g, mine[g.id]));
  main.appendChild(grid);
}
