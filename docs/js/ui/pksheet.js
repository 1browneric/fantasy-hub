// Pick sheet: one pick'em game opened up - the pick, its points, and why:
// where it ranks by win chance, both teams' odds, the pool's split, and what
// a win means against the pool when the pool fades it.
import { el, teamLogo, tag, fmtKick, pct } from '../util.js';
import { ordinal } from './rows.js';

const FADE = 0.10; // the email's POOL FADES THIS line
const money = v => (v == null ? '--' : v > 0 ? '+' + v : String(v));
const both = (a, b, f) => `${a.abbrev} ${f(a)} to ${b.abbrev} ${f(b)}`;

export function openPick(S, x) {
  const { r, g, pick, opp, conf, result } = x;
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const modal = el('div', 'modal'); modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const away = r.outs.find(o => !o.home) || r.outs[0], home = r.outs.find(o => o.home) || r.outs[1];
  const sheet = el('div', 'sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', r.name);
  sheet.style.setProperty('--tp', S.T[away.abbrev]?.primary || '#333'); sheet.style.setProperty('--to', S.T[home.abbrev]?.primary || '#555');

  const hd = el('div', 'hd gm');
  const side = (o, score, right) => {
    const d = el('div', 'gside' + (right ? ' r' : ''));
    d.appendChild(teamLogo(S.T, o.abbrev, 'xl')); d.appendChild(el('div', 'gab', o.abbrev));
    if (g && g.state !== 'pre') d.appendChild(el('div', 'gsc', String(score)));
    return d;
  };
  hd.appendChild(side(away, g?.awayScore, false));
  const mid = el('div', 'gmid');
  if (result === 'CORRECT') mid.appendChild(tag('me', 'CORRECT'));
  else if (result === 'INCORRECT') mid.appendChild(tag('them', 'WRONG'));
  else if (g?.state === 'in') mid.appendChild(tag('live', 'LIVE'));
  mid.appendChild(el('div', 'gdet', g?.state === 'in' ? g.detail : g?.state === 'post' ? 'Final' : fmtKick(r.kickoff)));
  hd.appendChild(mid);
  hd.appendChild(side(home, g?.homeScore, true));
  const xb = el('button', 'x', 'Close'); xb.onclick = () => modal.remove(); hd.appendChild(xb);
  sheet.appendChild(hd);

  const kv = el('div', 'kv');
  const cell = (k, v) => { const d = el('div'); d.appendChild(el('small', null, k)); d.appendChild(el('b', null, v)); kv.appendChild(d); };
  cell('Pick', pick ? pick.abbrev : 'None'); cell('Points', conf != null ? String(conf) : '-'); cell('Win chance', pick?.p != null ? pct(pick.p) : '--');
  sheet.appendChild(kv);

  // why this pick, at these points
  const why = el('div', 'rec');
  const line = t => why.appendChild(el('div', null, t));
  if (!pick) { why.appendChild(el('b', null, 'No pick')); line('Locked in ESPN with no pick on it'); }
  else {
    why.appendChild(el('b', null, `Why ${pick.abbrev} at ${conf ?? '-'}`));
    if (r.fav && pick !== r.fav) line(`Your call over the market: ${r.fav.abbrev} is favoured at ${pct(r.fav.p)}`);
    else if (r.rank) line(`${r.rank === 1 ? 'Surest' : ordinal(r.rank) + ' surest'} winner of the week's ${r.of} games by win chance`);
    if (pick.pool != null && pick.pool - (pick.p ?? 0) > 0.15) line(`${pct(pick.pool)} of the pool took ${pick.abbrev} too: a win keeps pace, a loss drops you behind them`);
  }
  sheet.appendChild(why);

  // the pool is on the other side of a game the market likes: that is ground to gain
  if (pick && opp && pick.p != null && pick.pool != null && pick.p - pick.pool > FADE) {
    const f = el('div', 'rec hold');
    f.appendChild(el('b', null, 'Pool fades this'));
    f.appendChild(el('div', null, `Market: ${pick.abbrev} ${pct(pick.p)}. Pool: ${pct(pick.pool)} took ${pick.abbrev}`));
    f.appendChild(el('div', null, `If ${pick.abbrev} wins, you gain ${conf != null ? conf + ' pts' : 'ground'} on the ${pct(1 - pick.pool)} who took ${opp.abbrev}`));
    sheet.appendChild(f);
  }

  sheet.appendChild(el('div', 'sec', 'Market and pool'));
  const stat = (k, v) => { const d = el('div', 'stat'); d.appendChild(el('span', null, k)); d.appendChild(el('b', null, v)); sheet.appendChild(d); };
  if (away.p != null) stat('Win chance', both(away, home, o => pct(o.p)));
  if (away.pool != null) stat('Pool picks', both(away, home, o => pct(o.pool)));
  stat('Moneyline', both(away, home, o => money(o.ml)));
  if (g) {
    const b = el('button', 'stat'); b.type = 'button'; b.appendChild(el('span', null, 'Game sheet')); b.appendChild(el('b', null, 'Open'));
    b.onclick = () => S.openGame(g); sheet.appendChild(b);
  }
  modal.appendChild(sheet); document.body.appendChild(modal); xb.focus();
}
