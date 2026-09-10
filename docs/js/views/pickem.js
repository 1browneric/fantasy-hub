// Pick'em: the Big Als confidence pool. Where I sit in the group, the week's
// games in confidence order with my pick in each, and the top of the table.
import { el, teamLogo, tag, fmtKick, fmtTime, pct } from '../util.js';
import { ordinal } from '../ui/rows.js';
import { ENTRY_ID } from '../sources/pickem.js';

const FADE = 0.10; // the email's POOL FADES THIS line: market beats the pool by 10 points
const DONE = new Set(['CORRECT', 'INCORRECT']);

export function render(S, main) {
  const P = S.pickem;
  if (!P) { main.appendChild(el('div', 'empty', S.pickemErr ? "Pick'em did not load" : "Pulling pick'em")); return; }
  if (S.pickemErr) { const b = el('div', 'banner'); b.appendChild(el('span', 'tag', 'STALE')); b.appendChild(el('span', null, `Pick'em as of ${fmtTime(P.fetched)}`)); main.appendChild(b); }

  const rows = pickRows(S);
  for (const n of standingBlock(S, rows)) main.appendChild(n);

  const right = rows.filter(x => x.result === 'CORRECT').length, wrong = rows.filter(x => x.result === 'INCORRECT').length;
  const h2 = el('div', 'h'); h2.appendChild(el('h2', null, 'My picks')); h2.appendChild(el('span', 'sub', `${right} correct, ${wrong} wrong, ${rows.filter(x => !x.result).length} to play`)); main.appendChild(h2);
  const list = el('section', 'panel pk-list');
  for (const x of rows) list.appendChild(row(S, x));
  main.appendChild(list);

  const ranked = [...P.entries].sort((a, b) => (a.score?.rank ?? 1e9) - (b.score?.rank ?? 1e9));
  const show = ranked.slice(0, 10); if (P.me && !show.includes(P.me)) show.push(P.me);
  const h3 = el('div', 'h'); h3.appendChild(el('h2', null, 'Big Als')); h3.appendChild(el('span', 'sub', `top 10 of ${P.size}`)); main.appendChild(h3);
  const panel = el('section', 'panel'); const scr = el('div', 'scroll');
  const t = el('table', 'tbl'); const tr = el('tr');
  for (const [c, cls] of [['', null], ['Entry', null], ['Wk', 'n'], ['Total', 'n']]) tr.appendChild(el('th', cls, c));
  const th = el('thead'); th.appendChild(tr); t.appendChild(th);
  const tb = el('tbody');
  for (const e of show) {
    const mine = e.id === ENTRY_ID; const r = el('tr', mine ? 'me' : null);
    r.appendChild(el('td', 'rk', e.score?.rank ? String(e.score.rank) : '-'));
    const n = el('td'); n.appendChild(el('b', null, e.name + (mine ? '  ME' : ''))); n.appendChild(el('small', 'pk-mem', e.member?.displayName || '')); r.appendChild(n);
    r.appendChild(el('td', 'n', String(e.score?.scoreByPeriod?.[P.period]?.score ?? 0)));
    r.appendChild(el('td', 'n', String(e.score?.overallScore ?? 0)));
    tb.appendChild(r);
  }
  t.appendChild(tb); scr.appendChild(t); panel.appendChild(scr); main.appendChild(panel);
}

// The week's games in confidence order: his pick once a game locks, the
// ladder's before that.
export function pickRows(S) {
  const P = S.pickem; if (!P) return [];
  const games = new Map(S.ctx.games.list.map(g => [String(g.id), g]));
  return P.rows.map(r => {
    const pick = r.picked || (r.locked ? null : r.fav);
    const g = games.get(r.event);
    return { r, g, pick, opp: pick ? r.outs.find(o => o !== pick) : null, conf: r.picked ? r.conf : r.locked ? null : r.ladderConf, result: result(r, g, pick) };
  }).sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));
}

// The header and the four-number standing. Shared with Home, where a tap on
// the numbers opens this tab.
export function standingBlock(S, rows = pickRows(S), onTap = null) {
  const P = S.pickem;
  const sc = P.me?.score || {};
  const wk = sc.scoreByPeriod?.[P.period] || {};
  const inPlay = rows.filter(x => x.pick && !x.result).reduce((s, x) => s + (x.conf || 0), 0);
  const h = el('div', 'h'); h.appendChild(el('h2', null, "Pick'em")); h.appendChild(el('span', 'sub', `${P.label}, ${P.size} entries`));
  const st = el(onTap ? 'button' : 'section', 'panel pk-stand');
  if (onTap) { st.type = 'button'; st.onclick = onTap; st.setAttribute('aria-label', "Pick'em standing, open Pick'em"); }
  const cell = (big, small) => { const c = el('div'); c.appendChild(el('b', 'num', big)); c.appendChild(el('span', null, small)); st.appendChild(c); };
  cell(sc.rank ? ordinal(sc.rank) : '-', `of ${P.size}`);
  cell(String(wk.score ?? 0), 'week pts');
  cell(String(inPlay), 'in play');
  cell(String(sc.overallScore ?? 0), 'season pts');
  return [h, st];
}

// ESPN's own verdict when it has posted one; the final score when it lags.
function result(r, g, pick) {
  if (DONE.has(r.result)) return r.result;
  if (!pick || g?.state !== 'post') return null;
  const [ps, os] = score(g, pick);
  return ps > os ? 'CORRECT' : ps < os ? 'INCORRECT' : null;
}
function score(g, pick) {
  const home = pick.abbrev === g.home;
  return home ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
}

function row(S, { r, g, pick, opp, conf, result }) {
  const live = g?.state === 'in';
  const d = el('button', 'pk-row' + (live ? ' live' : '') + (result === 'INCORRECT' ? ' miss' : ''));
  d.type = 'button';
  if (g) { d.onclick = () => S.openGame(g); d.setAttribute('aria-label', `${r.name}, open game`); }
  d.appendChild(el('span', 'pk-c', conf != null ? String(conf) : '-'));

  const t = el('div', 'pk-t');
  const ab = el('span', 'ab');
  if (pick) { ab.appendChild(teamLogo(S.T, pick.abbrev)); ab.append(pick.abbrev); } else ab.append(r.name);
  t.appendChild(ab);
  const vs = pick && opp ? (pick.home ? 'vs ' : '@ ') + opp.abbrev : '';
  let when = fmtKick(r.kickoff);
  if (g && pick && g.state === 'in') { const [ps, os] = score(g, pick); when = `${g.detail}  ${ps}-${os}`; }
  else if (g && pick && g.state === 'post') { const [ps, os] = score(g, pick); when = `Final  ${ps}-${os}`; }
  t.appendChild(el('small', null, [vs, when].filter(Boolean).join(', ')));
  d.appendChild(t);

  const rc = el('div', 'pk-r');
  if (result === 'CORRECT') rc.appendChild(tag('me', 'CORRECT'));
  else if (result === 'INCORRECT') rc.appendChild(tag('them', 'WRONG'));
  else if (!pick) rc.appendChild(tag('warn', 'NO PICK'));
  else if (live) { const [ps, os] = score(g, pick); rc.appendChild(ps > os ? tag('pre', 'LEADING') : ps < os ? tag('warn', 'TRAILING') : tag('final', 'TIED')); }
  const odds = [pick?.p != null ? `win ${pct(pick.p)}` : '', pick?.pool != null ? `pool ${pct(pick.pool)}` : ''].filter(Boolean).join('  ');
  if (odds) rc.appendChild(el('span', null, odds));
  if (!r.locked && pick?.p != null && pick.pool != null && pick.p - pick.pool > FADE) rc.appendChild(tag('pre', 'POOL FADES THIS'));
  d.appendChild(rc);
  return d;
}
