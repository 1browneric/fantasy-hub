// FANTASY HUB app: state, data refresh, tab routing, and the render loop.
import { $, el, fmtTime, normTeam } from './util.js';
import * as espn from './sources/espn.js';
import * as sleeper from './sources/sleeper.js';
import * as rt from './sources/rt.js';
import { makeLookup, buildBoats, boatsTransactions, buildRT, myMatchup, effectiveSlots } from './model.js';
import { openPlayer } from './ui/sheet.js';
import { openGame } from './ui/gamesheet.js';
import * as home from './views/home.js';
import * as matchup from './views/matchup.js';
import * as players from './views/players.js';
import * as rosters from './views/rosters.js';
import * as standings from './views/standings.js';
import * as waivers from './views/waivers.js';
import * as nfl from './views/nfl.js';

const Q = new URLSearchParams(location.search);
const DEBUG = { season: Q.get('season'), week: Q.get('week'), date: Q.get('date'), simulateLive: Q.get('simulate') === 'live', simulateSunday: Q.get('simulate') === 'sunday',
  get on() { return !!(this.season || this.week || this.date || this.simulateLive || this.simulateSunday); }, replayStats: !!Q.get('season') };
const MY_HANDLE = '1browneric2025';
const TABS = [['home', 'Home', home], ['matchup', 'Matchup', matchup], ['players', 'My Players', players],
  ['rosters', 'Rosters', rosters], ['standings', 'Standings', standings], ['waivers', 'Waivers', waivers], ['nfl', 'NFL', nfl]];

const S = {
  state: { tab: (location.hash || '#home').slice(1), lg: 'SoFi', week: null, season: null, updated: null, err: null, whatIf: {} },
  T: {}, index: {}, lookup: null, proj: { p: {} }, leagues: {}, cache: { stats: {}, trending: null },
  ctx: { stats: {}, proj: { p: {} }, games: { byTeam: new Map(), list: [] }, whatIf: {}, debug: DEBUG },
  leagueList: () => ['SoFi', 'Y60', 'Boats'].map(k => S.leagues[k]).filter(Boolean),
  go: tab => { S.state.tab = tab; history.replaceState(null, '', '#' + tab); S.render(); window.scrollTo(0, 0); },
  openPlayer: (slot, league) => openPlayer(S, slot, league),
  openGame: g => openGame(S, g),
  render, myPlayers, myGames,
};
S.ctx.whatIf = S.state.whatIf;

// union of my rostered players across leagues -> [{slot, owned:[{league, slot}]}]
function myPlayers() {
  const by = new Map();
  for (const L of S.leagueList()) {
    const me = L.byId[L.me]; if (!me) continue;
    for (const s of me.slots) {
      if (s.empty) continue;
      const key = s.pid || (s.name + '|' + s.pos);
      if (!by.has(key)) by.set(key, { slot: { ...s, slot: s.pos }, owned: [] });
      by.get(key).owned.push({ league: L, slot: s });
    }
  }
  return [...by.values()];
}
// "Thomas" not "Jr.", and a defense keeps its full label.
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
function shortName(slot) {
  if (slot.pos === 'DST') return slot.name;
  const w = slot.name.split(' ').filter(x => !SUFFIX.test(x));
  return w[w.length - 1] || slot.name;
}
function myGames() {
  const byGame = new Map();
  for (const p of myPlayers()) {
    const g = S.ctx.games.byTeam.get(p.slot.nfl); if (!g) continue;
    if (!byGame.has(g.id)) byGame.set(g.id, { g: S.ctx.games.list.find(x => x.id === g.id), names: [] });
    byGame.get(g.id).names.push(shortName(p.slot) + (p.owned.some(o => o.slot.starter) ? '' : ' (bn)'));
  }
  const order = g => g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2;
  return [...byGame.values()].sort((a, b) => order(a.g) - order(b.g) || new Date(a.g.kickoff) - new Date(b.g.kickoff));
}

async function boot() {
  try {
    const [T, index, proj, leagues] = await Promise.all(['teams', 'index', 'proj', 'leagues'].map(f => fetch(`data/${f}.json`, { cache: 'no-store' }).then(r => r.json())));
    S.T = T; S.index = index; S.lookup = makeLookup(index); S.proj = proj; S.ctx.proj = proj; S.baked = leagues.leagues;
  } catch (e) { S.state.err = 'Could not load app data: ' + e.message; render(); return; }
  buildRail();
  await refresh();
  schedule();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('hashchange', () => { S.state.tab = (location.hash || '#home').slice(1); render(); });
}

async function refresh() {
  try {
    const st = await sleeper.state();
    const season = DEBUG.season || st.season, week = Number(DEBUG.week) || st.week || st.display_week || 1;
    S.state.season = season; S.state.week = week;
    const boatsId = DEBUG.season === '2025' ? sleeper.BOATS_2025 : sleeper.BOATS_ID;
    const [games, stats, boats, so, y6, tr] = await Promise.all([
      espn.loadGames(DEBUG),
      sleeper.stats(season, week).catch(() => ({})),
      sleeper.league(boatsId, week).catch(e => { console.warn('Boats', e); return null; }),
      rt.load('SoFi').catch(e => { console.warn('SoFi', e); return null; }),
      rt.load('Y60').catch(e => { console.warn('Y60', e); return null; }),
      S.cache.trending ? null : sleeper.trending().catch(() => null),
    ]);
    S.ctx.games = games; S.ctx.stats = stats;
    if (tr) S.cache.trending = Object.fromEntries(tr.map(x => [x.player_id, x.count]));
    if (boats) { const L = buildBoats(boats, week, S.lookup, MY_HANDLE); S.leagues.Boats = L; sleeper.transactions(boatsId, week).then(x => { boatsTransactions(L, x, S.lookup); }).catch(() => {}); }
    if (so) S.leagues.SoFi = buildRT(so, S.lookup);
    if (y6) S.leagues.Y60 = buildRT(y6, S.lookup);
    S.state.err = null; S.state.updated = new Date();
  } catch (e) { S.state.err = e.message; console.error(e); }
  render();
}
let timer = null;
function schedule() {
  clearInterval(timer);
  const live = S.ctx.games.list.some(g => g.state === 'in');
  timer = setInterval(async () => { await refresh(); schedule(); }, live ? 30_000 : 300_000);
}

function buildRail() {
  const rail = $('#rail'); rail.innerHTML = '';
  for (const [id, label] of TABS) {
    const b = el('button', null, label); b.setAttribute('role', 'tab'); b.dataset.tab = id;
    b.onclick = () => S.go(id); rail.appendChild(b);
  }
}
function render() {
  const main = $('#view'); main.innerHTML = '';
  document.querySelectorAll('#rail button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.state.tab)));
  const live = S.ctx.games.list.filter(g => g.state === 'in').length;
  $('#wk').textContent = S.state.week ? `WK ${S.state.week}` : '';
  $('#live').textContent = live ? `${live} live` : ''; $('#live').hidden = !live;
  $('#upd').textContent = S.state.updated ? fmtTime(S.state.updated) : 'Loading'; $('#upd').title = 'Last refresh';
  const pn = document.querySelector('#rail button[data-tab="players"]'); if (pn) { pn.textContent = 'My Players'; const n = myPlayers().filter(p => S.ctx.games.byTeam.get(p.slot.nfl)?.state === 'in').length; if (n) pn.appendChild(el('span', 'cnt', String(n))); }
  if (DEBUG.on) { const b = el('div', 'banner'); b.appendChild(el('span', 'tag', 'REPLAY')); b.appendChild(el('span', null, `Historical data, ${DEBUG.season || 'current'} week ${S.state.week || '?'}. Not live.`)); main.appendChild(b); }
  if (S.state.err) { const b = el('div', 'banner'); b.appendChild(el('span', 'tag', 'OFFLINE')); b.appendChild(el('span', null, S.state.err + '. Showing last known values.')); main.appendChild(b); }
  for (const k of ['SoFi', 'Y60', 'Boats']) if (!S.leagues[k] && S.state.updated) { const b = el('div', 'banner'); b.appendChild(el('span', 'tag', 'MISSING')); b.appendChild(el('span', null, `${k} did not load this refresh.`)); main.appendChild(b); }
  const tab = TABS.find(t => t[0] === S.state.tab) || TABS[0];
  if (!S.state.updated && !S.state.err) { main.appendChild(el('div', 'empty', 'Pulling live feeds')); return; }
  try { tab[2].render(S, main); } catch (e) { console.error(e); main.appendChild(el('div', 'banner', 'Render error: ' + e.message)); }
}
boot();
