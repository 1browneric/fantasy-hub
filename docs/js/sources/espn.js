// ESPN public scoreboard: every NFL game this week, live clock and score.
import { normTeam } from '../util.js';
const SB = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export async function loadGames(debug) {
  const url = debug.date ? `${SB}?dates=${debug.date}` : SB;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('ESPN scoreboard HTTP ' + r.status);
  const d = await r.json();
  const byTeam = new Map(), list = [];
  for (const ev of d.events || []) {
    const c = ev.competitions?.[0]; if (!c) continue;
    const st = c.status || {}, t = st.type || {};
    const home = c.competitors.find(x => x.homeAway === 'home'), away = c.competitors.find(x => x.homeAway === 'away');
    if (!home || !away) continue;
    const H = normTeam(home.team.abbreviation), A = normTeam(away.team.abbreviation);
    const period = st.period || 0, clock = st.displayClock || '';
    let elapsed = 0;
    if (t.state === 'post') elapsed = 1;
    else if (t.state === 'in') {
      const [m, s] = clock.split(':').map(Number);
      const left = (Number.isFinite(m) ? m * 60 + (s || 0) : 0);
      elapsed = Math.min(1, ((Math.min(period, 4) - 1) * 900 + (900 - left)) / 3600);
    }
    const situ = c.situation || {};
    const g = {
      id: ev.id, name: ev.shortName, kickoff: ev.date, state: t.state, detail: t.shortDetail || '',
      period, clock, elapsed, home: H, away: A,
      homeScore: Number(home.score || 0), awayScore: Number(away.score || 0),
      possession: situ.possession ? (situ.possession === home.id ? H : A) : null,
      redzone: !!situ.isRedZone, down: situ.downDistanceText || '', lastPlay: situ.lastPlay?.text || '',
      broadcast: c.broadcasts?.[0]?.names?.[0] || '',
    };
    list.push(g);
    for (const [me, opp, isHome] of [[H, A, true], [A, H, false]]) {
      byTeam.set(me, { ...g, team: me, opp, isHome, myScore: isHome ? g.homeScore : g.awayScore, oppScore: isHome ? g.awayScore : g.homeScore });
    }
  }
  if (debug.simulateLive) {
    let i = 0;
    for (const g of [...list, ...byTeam.values()]) {
      g.state = 'in'; g.period = (i % 4) + 1; g.clock = `${i % 15}:${String(59 - (i * 7) % 60).padStart(2, '0')}`;
      g.detail = `Q${g.period} ${g.clock}`; g.elapsed = ((g.period - 1) * 900 + (900 - ((i % 15) * 60))) / 3600;
      g.redzone = i % 5 === 0; g.possession = i % 2 ? g.home : g.away; i++;
    }
  }
  list.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  return { byTeam, list, week: d.week?.number, season: d.season?.year };
}
