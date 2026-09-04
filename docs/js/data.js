// Live data layer. Two public feeds, no keys, both send CORS headers so the
// phone talks to them directly.
//
// SPLIT OF RESPONSIBILITY (deliberate, see README):
//   ESPN scoreboard  -> game state: opponent, kickoff, quarter/clock, score.
//   Sleeper stats    -> stat lines + everything the scoring formulas need.
// ESPN's boxscore CAN supply stats, but it returns display strings ("17/32")
// per category and has no clean fumbles-lost / 2pt / team-defense line.
// Sleeper returns normalized numeric keys that map 1:1 onto both leagues'
// scoring, so Sleeper is PRIMARY for stats and ESPN is PRIMARY for game state.

const ESPN_SB = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

// Debug overrides. Live NFL stats cannot exist before Sep 9 2026, so
// ?season=2025&week=1&date=20250907 replays a real completed slate through the
// exact production code path. No effect unless the params are present.
const Q = new URLSearchParams(location.search);
export const DEBUG = {
  season: Q.get('season'), week: Q.get('week'), date: Q.get('date'),
  // ?simulate=live forces every game into an in-progress state so the live
  // layout (LIVE tag, quarter + clock, running score) can be verified before
  // any real 2026 game kicks off. Never active without the explicit param.
  simulateLive: Q.get('simulate') === 'live',
  get on() { return !!(this.season || this.week || this.date || this.simulateLive); },
};
const SLEEPER = 'https://api.sleeper.app/v1';
const BOATS_ID = '1389390879541727232';

const TEAM_ALIASES = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
export const normTeam = t => TEAM_ALIASES[(t || '').toUpperCase()] || (t || '').toUpperCase();

async function j(url, label) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
  return r.json();
}

// Map every NFL team -> its game this week, from the ESPN scoreboard.
export async function loadGames() {
  const url = DEBUG.date ? `${ESPN_SB}?dates=${DEBUG.date}` : ESPN_SB;
  const d = await j(url, 'ESPN scoreboard');
  const byTeam = new Map();
  for (const ev of d.events || []) {
    const c = ev.competitions?.[0];
    if (!c) continue;
    const st = c.status || {};
    const t = st.type || {};
    const state = t.state; // pre | in | post
    const comps = c.competitors || [];
    const home = comps.find(x => x.homeAway === 'home');
    const away = comps.find(x => x.homeAway === 'away');
    if (!home || !away) continue;
    const H = normTeam(home.team?.abbreviation), A = normTeam(away.team?.abbreviation);

    for (const [me, opp, isHome] of [[H, A, true], [A, H, false]]) {
      byTeam.set(me, {
        eventId: ev.id,
        opp, isHome,
        kickoff: ev.date,
        state,                         // pre | in | post
        // "Q3 8:42" while live, "Final" when done, kickoff time before.
        detail: t.shortDetail || '',
        period: st.period,
        clock: st.displayClock,
        myScore: Number((isHome ? home : away).score || 0),
        oppScore: Number((isHome ? away : home).score || 0),
      });
    }
  }
  if (DEBUG.simulateLive) {
    let i = 0;
    for (const g of byTeam.values()) {
      g.state = 'in';
      const q = (i % 4) + 1, sec = 59 - ((i * 7) % 60);
      g.detail = `Q${q} ${(i % 15)}:${String(sec).padStart(2, '0')}`;
      i++;
    }
  }
  return byTeam;
}

export async function loadWeek() {
  const s = await j(`${SLEEPER}/state/nfl`, 'Sleeper state');
  return {
    week: Number(DEBUG.week) || s.week || s.display_week || 1,
    season: DEBUG.season || s.season,
  };
}

// Sleeper returns {} until the first game of the week kicks off. That is
// expected, not an error -- the UI shows "no stats yet", never a failure.
export async function loadStats(season, week) {
  return j(`${SLEEPER}/stats/nfl/regular/${season}/${week}`, 'Sleeper stats');
}

// Live Boats scoring, falling back to the copy baked at build time.
export async function loadBoatsScoring(baked) {
  try {
    const l = await j(`${SLEEPER}/league/${BOATS_ID}`, 'Sleeper league');
    if (l?.scoring_settings) return { scoring: l.scoring_settings, source: 'live' };
  } catch (e) { console.warn('Boats scoring live fetch failed, using baked copy', e); }
  return { scoring: baked, source: 'baked' };
}
