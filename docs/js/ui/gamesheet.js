// Game sheet: one NFL game expanded, in three tabs. SUMMARY is the live
// score, situation, last play, every scoring play and my players in the
// game; TEAM STATS and PLAYERS are the box score, ESPN's shape: the two
// teams side by side, then every player on the chosen team by group. The
// sheet redraws in place on every refresh while it is open, and the live
// game it shows has its summary re-read each refresh only while it is open.
import { el, teamLogo, tag, fmtKick, football, normName } from '../util.js';
import { myMatchup } from '../model.js';
import { playerRow } from './rows.js';
import { scoringList } from '../views/nfl.js';

const TABS = [['summary', 'Summary'], ['team', 'Team stats'], ['players', 'Players']];

export function openGame(S, g) {
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const modal = el('div', 'modal');
  const sheet = el('div', 'sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', g.name);
  const view = { tab: 'summary', side: g.away };
  const close = () => { modal.remove(); if (S.liveSheet?.node === modal) S.liveSheet = null; };
  modal.onclick = e => { if (e.target === modal) close(); };
  const redraw = () => {
    const cur = S.ctx.games.list.find(x => x.id === g.id) || g;
    const top = sheet.scrollTop;
    sheet.textContent = '';
    fill(S, sheet, cur, view, close, redraw);
    sheet.scrollTop = top;
  };
  S.liveSheet = { id: g.id, node: modal, redraw };
  redraw();
  modal.appendChild(sheet); document.body.appendChild(modal); sheet.querySelector('.x').focus();
}

function fill(S, sheet, g, view, close, redraw) {
  sheet.style.setProperty('--tp', S.T[g.away]?.primary || '#333'); sheet.style.setProperty('--to', S.T[g.home]?.primary || '#555');
  const hd = el('div', 'hd gm');
  const side = (abbr, score, other, right) => {
    const d = el('div', 'gside' + (right ? ' r' : ''));
    d.appendChild(teamLogo(S.T, abbr, 'xl'));
    const n = el('div', 'gab', abbr);
    if (g.state === 'in' && g.possession === abbr) {
      n.appendChild(football());
      if (g.redzone) n.appendChild(el('span', 'poss', 'RED ZONE'));
    }
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
  const x = el('button', 'x', 'Close'); x.onclick = close; hd.appendChild(x);
  sheet.appendChild(hd);

  const tabs = el('div', 'chips'); tabs.setAttribute('role', 'tablist');
  for (const [id, label] of TABS) {
    const b = el('button', 'chip', label); b.type = 'button'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-pressed', String(view.tab === id)); b.setAttribute('aria-selected', String(view.tab === id));
    b.onclick = () => { view.tab = id; redraw(); sheet.scrollTop = 0; };
    tabs.appendChild(b);
  }
  sheet.appendChild(tabs);

  const sum = S.scoring[g.id];
  if (view.tab === 'summary') summary(S, sheet, g, sum);
  else if (view.tab === 'team') teamStats(S, sheet, g, sum);
  else playersTab(S, sheet, g, sum, view, redraw);
}

function summary(S, sheet, g, sum) {
  if (g.state === 'in' && g.lastPlay) { sheet.appendChild(el('div', 'sec', 'Last play')); sheet.appendChild(el('div', 'stat', g.lastPlay)); }
  // every score in the game, by quarter, with the running score
  const plays = sum?.plays;
  if (g.state !== 'pre') {
    sheet.appendChild(el('div', 'sec', 'Scoring plays' + (plays?.length ? ` (${plays.length})` : '')));
    if (plays?.length) sheet.appendChild(scoringList(S, g, plays, 0));
    else sheet.appendChild(el('div', 'stat', sum ? 'No score yet' : 'Loading'));
  }
  const mine = S.myPlayers().filter(p => p.slot.nfl === g.away || p.slot.nfl === g.home);
  mine.sort((a, b) => (b.owned.some(o => o.slot.starter) - a.owned.some(o => o.slot.starter)) || a.slot.nfl.localeCompare(b.slot.nfl) || a.slot.name.localeCompare(b.slot.name));
  sheet.appendChild(el('div', 'sec', `My players in this game (${mine.length})`));
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
}

// Before kickoff there is nothing to show; while the summary is still on
// its way the tab says so rather than sitting blank.
function notYet(sheet, g, sum, what) {
  if (g.state === 'pre') { sheet.appendChild(el('div', 'empty', `${what} once the game kicks off`)); return true; }
  if (!sum) { sheet.appendChild(el('div', 'stat', 'Loading')); return true; }
  return false;
}

// Team stats, the two teams side by side, ESPN's rows in ESPN's order.
function teamStats(S, sheet, g, sum) {
  if (notYet(sheet, g, sum, 'Team stats')) return;
  const away = sum.box.teams.find(t => t.team === g.away), home = sum.box.teams.find(t => t.team === g.home);
  if (!away?.stats.length || !home?.stats.length) { sheet.appendChild(el('div', 'stat', 'No team stats yet')); return; }
  const wrap = el('div', 'tsw');
  const t = el('table', 'ts');
  const th = el('tr');
  const cell = (abbr, right) => { const c = el('th', 'v' + (right ? ' r' : '')); c.appendChild(teamLogo(S.T, abbr)); c.append(abbr); return c; };
  th.appendChild(cell(g.away)); th.appendChild(el('th', 'l', 'Team stats')); th.appendChild(cell(g.home, true));
  t.appendChild(th);
  const homeBy = new Map(home.stats);
  for (const [label, av] of away.stats) {
    const tr = el('tr');
    tr.appendChild(el('td', 'v', av)); tr.appendChild(el('td', 'l', label)); tr.appendChild(el('td', 'v r', homeBy.get(label) ?? ''));
    t.appendChild(tr);
  }
  wrap.appendChild(t); sheet.appendChild(wrap);
  if (sum.at) sheet.appendChild(el('div', 'note', g.state === 'in' ? 'Refreshes with the game while this is open' : 'Final box score'));
}

// The players: game leaders first, then one team at a time, every group
// ESPN shows in ESPN's order, name column pinned while the numbers scroll.
// A player I own is marked with the league that owns him.
function playersTab(S, sheet, g, sum, view, redraw) {
  if (notYet(sheet, g, sum, 'Player stats')) return;
  // my players by ESPN id where Sleeper knows it (it often does not), and
  // by name + team otherwise
  // (collapsed, so De'Von and Devon agree, under the roster's spelling and
  // the index's)
  const mine = new Map();
  const nk = (name, team) => normName(name).replace(/\s+/g, '') + '|' + team;
  for (const p of S.myPlayers()) {
    const who = p.owned.map(o => o.league.key).join(' ');
    const ix = S.index[p.slot.pid];
    if (ix?.[4]) mine.set(String(ix[4]), who);
    mine.set(nk(p.slot.name, p.slot.nfl), who);
    if (ix?.[0]) mine.set(nk(ix[0], p.slot.nfl), who);
  }
  const owner = (id, name, team) => mine.get(id) || mine.get(nk(name, team)) || '';
  const leaders = sum.box.leaders;
  const cats = ['passingYards', 'rushingYards', 'receivingYards'];
  if (leaders.some(l => l.cats.length)) {
    sheet.appendChild(el('div', 'sec', 'Leaders'));
    const box = el('div', 'ldrs');
    for (const c of cats) {
      const A = leaders.find(l => l.team === g.away)?.cats.find(x => x.name === c), H = leaders.find(l => l.team === g.home)?.cats.find(x => x.name === c);
      if (!A && !H) continue;
      box.appendChild(el('div', 'lc', (A || H).label));
      for (const [L, abbr] of [[A, g.away], [H, g.home]]) {
        const r = el('div', 'lr'); r.appendChild(teamLogo(S.T, abbr));
        const w = el('div', 'w'); const n = el('div', 'n', L?.who || '--'); const o = L ? owner(L.id, L.who, abbr) : ''; if (o) n.appendChild(tag('me', o)); w.appendChild(n);
        w.appendChild(el('div', 'v', L?.value || '')); r.appendChild(w); box.appendChild(r);
      }
    }
    sheet.appendChild(box);
  }
  const pick = el('div', 'chips side');
  for (const abbr of [g.away, g.home]) {
    const b = el('button', 'chip'); b.type = 'button'; b.appendChild(teamLogo(S.T, abbr)); b.append(S.T[abbr]?.name || abbr);
    b.setAttribute('aria-pressed', String(view.side === abbr)); b.onclick = () => { view.side = abbr; redraw(); };
    pick.appendChild(b);
  }
  sheet.appendChild(pick);
  const team = sum.box.players.find(p => p.team === view.side);
  if (!team?.groups.length) { sheet.appendChild(el('div', 'stat', 'No player stats yet')); return; }
  for (const grp of team.groups) {
    sheet.appendChild(el('div', 'sec', grp.label));
    const wrap = el('div', 'scroll');
    const t = el('table', 'bx');
    const th = el('tr'); th.appendChild(el('th', null, grp.label.toLowerCase() === 'defense' ? 'Player' : ''));
    for (const l of grp.labels) th.appendChild(el('th', null, l));
    t.appendChild(th);
    for (const r of grp.rows) {
      const o = owner(r.id, r.name, view.side);
      const tr = el('tr', o ? 'me' : null);
      const nm = el('td'); nm.append(r.name); if (o) nm.appendChild(tag('me', o)); tr.appendChild(nm);
      for (const v of r.stats) tr.appendChild(el('td', null, v));
      t.appendChild(tr);
    }
    if (grp.totals.some(v => v !== '' && v != null) && grp.rows.length > 1) {
      const tr = el('tr', 'tot'); tr.appendChild(el('td', null, 'Team'));
      for (const v of grp.totals) tr.appendChild(el('td', null, v ?? ''));
      t.appendChild(tr);
    }
    wrap.appendChild(t); sheet.appendChild(wrap);
  }
}
