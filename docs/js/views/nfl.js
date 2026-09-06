// NFL: every game this week with logos, live score, clock, possession,
// red zone, and which of my players are in it.
import { el, teamLogo, paintTeam, tag, fmtKick } from '../util.js';

export function gameChip(S, g, names) {
  const c = el('button', 'game' + (g.state === 'in' ? ' live' : ''));
  c.type = 'button'; c.setAttribute('aria-label', `${g.away} at ${g.home}, open game`); c.onclick = () => S.openGame(g);
  c.style.setProperty('--tp', S.T[g.away]?.primary || '#333'); c.style.setProperty('--to', S.T[g.home]?.primary || '#777');
  const side = (abbr, score, other) => {
    const t = el('div', 't' + (g.state !== 'pre' && score < other ? ' trail' : ''));
    const ab = el('span', 'ab'); ab.appendChild(teamLogo(S.T, abbr, 'lg')); ab.append(abbr);
    if (g.state === 'in' && g.possession === abbr) ab.appendChild(el('span', 'rz', g.redzone ? 'RED ZONE' : 'BALL'));
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
  if (names?.length) { const m = el('div', 'mine'); for (const n of names) m.appendChild(el('span', null, n)); c.appendChild(m); }
  return c;
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
