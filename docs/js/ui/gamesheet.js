// Game sheet: one NFL game expanded -- live score, clock, situation, last
// play, and every one of my players in it as full rows (both leagues' points).
import { el, f1, teamLogo, tag, fmtKick } from '../util.js';
import { myMatchup } from '../model.js';
import { playerRow } from './rows.js';

export function openGame(S, g) {
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const modal = el('div', 'modal'); modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const sheet = el('div', 'sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', g.name);
  sheet.style.setProperty('--tp', S.T[g.away]?.primary || '#333'); sheet.style.setProperty('--to', S.T[g.home]?.primary || '#555');
  const hd = el('div', 'hd gm');
  const side = (abbr, score, other, right) => {
    const d = el('div', 'gside' + (right ? ' r' : ''));
    d.appendChild(teamLogo(S.T, abbr, 'xl'));
    const n = el('div', 'gab', abbr);
    if (g.state === 'in' && g.possession === abbr) n.appendChild(el('span', 'poss', g.redzone ? 'RED ZONE' : 'BALL'));
    d.appendChild(n);
    d.appendChild(el('div', 'gsc' + (g.state !== 'pre' && score < other ? ' trail' : ''), g.state === 'pre' ? '' : String(score)));
    return d;
  };
  hd.appendChild(side(g.away, g.awayScore, g.homeScore, false));
  const mid = el('div', 'gmid');
  if (g.state !== 'pre') mid.appendChild(tag(g.state === 'in' ? 'live' : 'final', g.state === 'in' ? 'LIVE' : 'FINAL'));
  mid.appendChild(el('div', 'gdet', g.state === 'in' ? g.detail : g.state === 'post' ? 'Final' : fmtKick(g.kickoff)));
  if (g.state === 'in' && g.down) mid.appendChild(el('div', 'gdown', g.down));
  if (g.broadcast) mid.appendChild(el('div', 'gtv', g.broadcast));
  hd.appendChild(mid);
  hd.appendChild(side(g.home, g.homeScore, g.awayScore, true));
  const x = el('button', 'x', 'Close'); x.onclick = () => modal.remove(); hd.appendChild(x);
  sheet.appendChild(hd);
  if (g.state === 'in' && g.lastPlay) { sheet.appendChild(el('div', 'sec', 'Last play')); sheet.appendChild(el('div', 'stat', g.lastPlay)); }

  const mine = S.myPlayers().filter(p => p.slot.nfl === g.away || p.slot.nfl === g.home);
  mine.sort((a, b) => (b.owned.some(o => o.slot.starter) - a.owned.some(o => o.slot.starter)) || a.slot.nfl.localeCompare(b.slot.nfl) || a.slot.name.localeCompare(b.slot.name));
  const sec = el('div', 'sec'); sec.textContent = `My players in this game (${mine.length})`; sheet.appendChild(sec);
  const ul = el('ul', 'rows');
  for (const p of mine) {
    const o = p.owned;
    const opts = { league: o[0].league, ctx: S.ctx, matchup: myMatchup(o[0].league)?.m, onOpen: S.openPlayer };
    if (o[1]) opts.second = { league: o[1].league, ctx: S.ctx, matchup: myMatchup(o[1].league)?.m };
    const li = playerRow(S, p.slot, opts);
    li.querySelector('.slot').appendChild(el('small', null, o.map(x => x.league.key + (x.slot.starter ? '' : ' bn')).join(' ')));
    ul.appendChild(li);
  }
  if (!mine.length) ul.appendChild(el('li', 'empty', 'None of your players are in this game'));
  sheet.appendChild(ul);
  modal.appendChild(sheet); document.body.appendChild(modal); x.focus();
}
