import { loadGames, loadWeek, loadStats, loadBoatsScoring, normTeam, DEBUG } from './data.js';
import { scoreRT, scoreSleeper } from './scoring.js';
import { statLine } from './statline.js';

const LEAGUES = ['SoFi', 'Y60', 'Boats'];
const state = {
  players: [], leagues: null, boats: null, boatsSource: null,
  games: new Map(), stats: {}, week: null, season: null,
  filter: 'ALL', liveOnly: false, err: null, updated: null, unmatched: 0,
};

const $ = s => document.querySelector(s);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

async function boot() {
  try {
    const [p, l] = await Promise.all([
      fetch('data/players.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('data/leagues.json', { cache: 'no-store' }).then(r => r.json()),
    ]);
    state.players = p.players;
    state.unmatched = p.players.filter(x => x.unmatched).length;
    state.leagues = l.leagues;
  } catch (e) {
    state.err = 'Could not load roster data. ' + e.message;
    render(); return;
  }
  buildFilters();
  await refresh();
  scheduleRefresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

async function refresh() {
  try {
    const wk = await loadWeek();
    state.week = wk.week; state.season = wk.season;
    const [games, stats, boats] = await Promise.all([
      loadGames(),
      loadStats(wk.season, wk.week).catch(() => ({})),
      loadBoatsScoring(state.leagues.Boats.scoring),
    ]);
    state.games = games; state.stats = stats;
    state.boats = boats.scoring; state.boatsSource = boats.source;
    state.err = null; state.updated = new Date();
  } catch (e) {
    state.err = e.message;
  }
  render();
}

// Poll fast while anything is live, slowly otherwise. He never pulls to refresh.
let timer = null;
function scheduleRefresh() {
  clearInterval(timer);
  const live = [...state.games.values()].some(g => g.state === 'in');
  timer = setInterval(async () => { await refresh(); scheduleRefresh(); },
    live ? 30_000 : 300_000);
}

function buildFilters() {
  const row = $('#filters');
  row.innerHTML = '';
  for (const f of ['ALL', ...LEAGUES]) {
    const b = el('button', 'chip' + (state.filter === f ? ' on' : ''), f === 'ALL' ? 'All' : f);
    b.onclick = () => { state.filter = f; buildFilters(); render(); };
    row.appendChild(b);
  }
  const t = el('button', 'chip toggle' + (state.liveOnly ? ' on' : ''), 'Playing now');
  t.onclick = () => { state.liveOnly = !state.liveOnly; buildFilters(); render(); };
  $('#toggles').innerHTML = ''; $('#toggles').appendChild(t);
}

function rowsFor() {
  let rows = state.players.map(p => {
    const g = state.games.get(normTeam(p.nfl)) || null;
    const s = state.stats?.[p.sleeperId] || null;
    const pts = {};
    for (const lg of p.leagues) {
      pts[lg] = lg === 'Boats' ? scoreSleeper(s, state.boats) : scoreRT(s, p.pos);
    }
    return { p, g, s, pts, line: statLine(s, p.pos) };
  });
  if (state.filter !== 'ALL') rows = rows.filter(r => r.p.leagues.includes(state.filter));
  if (state.liveOnly) rows = rows.filter(r => r.g?.state === 'in');
  // Live first, then upcoming by kickoff, then finals. Never by bye week.
  const rank = g => (g?.state === 'in' ? 0 : g?.state === 'pre' ? 1 : g?.state === 'post' ? 2 : 3);
  rows.sort((a, b) => {
    const d = rank(a.g) - rank(b.g); if (d) return d;
    if (rank(a.g) === 1) return new Date(a.g.kickoff) - new Date(b.g.kickoff);
    const ap = Math.max(...Object.values(a.pts).map(x => x ?? -1));
    const bp = Math.max(...Object.values(b.pts).map(x => x ?? -1));
    return bp - ap;
  });
  return rows;
}

const fmtKick = iso => new Date(iso).toLocaleString([], {
  weekday: 'short', hour: 'numeric', minute: '2-digit',
});

function gameBits(g) {
  if (!g) return { cls: 'off', tag: 'NO GAME', text: 'Not on this week’s slate' };
  const vs = `${g.isHome ? 'vs' : '@'} ${g.opp}`;
  if (g.state === 'in') {
    return { cls: 'live', tag: 'LIVE',
      text: `${vs}  ${g.detail}  ${g.myScore}-${g.oppScore}` };
  }
  if (g.state === 'post') {
    return { cls: 'final', tag: 'FINAL',
      text: `${vs}  ${g.myScore}-${g.oppScore}` };
  }
  return { cls: 'pre', tag: 'PRE', text: `${vs}  ${fmtKick(g.kickoff)}` };
}

function render() {
  const list = $('#list');
  list.innerHTML = '';

  $('#week').textContent = state.week ? `Week ${state.week}` : '';
  $('#updated').textContent = state.updated
    ? `Updated ${state.updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
    : 'Loading';

  const banner = $('#banner');
  banner.innerHTML = '';
  if (DEBUG.on) {
    const b = el('div', 'banner warn');
    b.appendChild(el('span', 'tag', 'REPLAY'));
    b.appendChild(el('span', null,
      `Historical data (${DEBUG.season || 'current'} wk ${DEBUG.week || '?'}) — not live.`));
    banner.appendChild(b);
  }
  if (state.err) {
    const b = el('div', 'banner warn');
    b.appendChild(el('span', 'tag', 'OFFLINE'));
    b.appendChild(el('span', null, state.err + ' Showing last known values.'));
    banner.appendChild(b);
  }
  if (state.unmatched) {
    const b = el('div', 'banner warn');
    b.appendChild(el('span', 'tag', 'UNMATCHED'));
    b.appendChild(el('span', null, `${state.unmatched} player(s) could not be linked to a live stat feed.`));
    banner.appendChild(b);
  }

  const rows = rowsFor();
  const liveN = [...state.games.values()].filter(g => g.state === 'in').length / 2;
  $('#sub').textContent = `${rows.length} shown  ${Math.round(liveN)} game(s) live`;

  if (!rows.length) {
    list.appendChild(el('p', 'empty', state.liveOnly ? 'No games in progress.' : 'No players match this filter.'));
    return;
  }

  for (const r of rows) {
    const card = el('article', 'card');
    const g = gameBits(r.g);
    card.classList.add('s-' + g.cls);

    const top = el('div', 'top');
    const id = el('div', 'id');
    id.appendChild(el('span', 'nm', r.p.name));
    id.appendChild(el('span', 'meta', `${r.p.pos} · ${r.p.nfl}`));
    top.appendChild(id);

    // Points, one per league -- a two-league player shows BOTH.
    const pts = el('div', 'pts');
    for (const lg of r.p.leagues) {
      const v = r.pts[lg];
      const cell = el('div', 'ptcell');
      cell.appendChild(el('span', 'plg', lg));
      cell.appendChild(el('span', 'pval' + (v == null ? ' dim' : ''), v == null ? '—' : v.toFixed(2)));
      pts.appendChild(cell);
    }
    top.appendChild(pts);
    card.appendChild(top);

    // Status line: shape/text cue ALWAYS accompanies the colour.
    const st = el('div', 'status');
    st.appendChild(el('span', 'tag t-' + g.cls, g.tag));
    st.appendChild(el('span', 'gtxt', g.text));
    card.appendChild(st);

    if (r.p.unmatched) {
      const u = el('div', 'unmatched');
      u.appendChild(el('span', 'tag t-warn', 'UNMATCHED'));
      u.appendChild(el('span', null, 'No stat-feed link — points unavailable'));
      card.appendChild(u);
    } else {
      const sl = el('div', 'line');
      sl.textContent = r.line || (r.g?.state === 'pre' ? 'No stats yet' : 'No stats recorded');
      if (!r.line) sl.classList.add('dim');
      card.appendChild(sl);
    }
    list.appendChild(card);
  }
}

boot();
