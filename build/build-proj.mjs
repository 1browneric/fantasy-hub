// Build step (hourly, in the RT workflow): Sleeper's weekly projections for
// every fantasy position, scored under BOTH scoring systems so the phone never
// downloads the 2-3 MB raw feed. Output docs/data/proj.json:
//   { season, week, builtAt, p: { sleeperId: [rtPts, boatsPts] } }
import fs from 'node:fs';
import { scoreRT, scoreSleeper } from '../docs/js/scoring.js';
const state = await (await fetch('https://api.sleeper.app/v1/state/nfl')).json();
const season = process.env.SEASON || state.season;
const week = Number(process.env.WEEK || state.week || 1);
const boats = JSON.parse(fs.readFileSync('docs/data/leagues.json', 'utf8')).leagues.Boats.scoring;
const p = {};
for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
  const url = `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&position[]=${pos}`;
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
  for (const row of await r.json()) {
    const s = row.stats || {}; if (!row.player_id) continue;
    const rt = scoreRT(s, pos === 'DEF' ? 'DST' : pos), bo = scoreSleeper(s, boats);
    if (rt || bo) p[row.player_id] = [rt, bo];
  }
}
fs.writeFileSync('docs/data/proj.json', JSON.stringify({ season, week, builtAt: new Date().toISOString(), p }));
console.log(`proj.json: season ${season} week ${week}, ${Object.keys(p).length} players, ${Math.round(fs.statSync('docs/data/proj.json').size / 1024)} KB`);
