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
  // ?simulate=sunday: a mid-afternoon Sunday. Games that kicked off before
  // 2pm Central are final (real scores), the 3:05/3:25 window is in progress,
  // everything later has not started. Only with an explicit param.
  if (debug.simulateSunday) {
    let i = 0;
    for (const g of [...list, ...byTeam.values()]) {
      const h = Number(new Date(g.kickoff).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }));
      const day = new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', timeZone: 'America/Chicago' });
      if (day !== 'Sun' && day !== 'Mon') { g.state = 'post'; g.elapsed = 1; g.detail = 'Final'; }
      else if (day === 'Sun' && h < 14) { g.state = 'post'; g.elapsed = 1; g.detail = 'Final'; }
      else if (day === 'Sun' && h < 18) {
        g.state = 'in'; g.period = 2 + (i % 2); g.clock = `${3 + (i * 5) % 12}:${String((i * 17) % 60).padStart(2, '0')}`;
        g.detail = `Q${g.period} ${g.clock}`; g.elapsed = ((g.period - 1) * 900 + (900 - ((3 + (i * 5) % 12) * 60))) / 3600;
        g.redzone = i % 3 === 0; g.possession = i % 2 ? g.home : g.away; g.down = ['2nd & 7 at KC 34', '1st & 10 at DAL 22', '3rd & 2 at PHI 48'][i % 3];
        g.lastPlay = ['12 yard pass complete to the left side.', '4 yard run up the middle.', 'Incomplete pass, deep right.'][i % 3];
      } else { g.state = 'pre'; g.elapsed = 0; g.homeScore = 0; g.awayScore = 0; g.myScore = 0; g.oppScore = 0; }
      i++;
    }
  }
  list.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  return { byTeam, list, week: d.week?.number, season: d.season?.year };
}
