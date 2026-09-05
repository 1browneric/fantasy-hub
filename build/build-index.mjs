// Build step: a compact index of every fantasy-relevant NFL player from
// Sleeper's 14.6 MB universe -> docs/data/index.json (~120 KB, cached by
// the service worker). Lets the phone name any Sleeper id it meets in
// opponents' rosters, transactions, trending adds and waiver candidates.
import fs from 'node:fs';
const src = process.argv[2]; // optional local copy of players/nfl
const POS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const ALIAS = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
const all = src ? JSON.parse(fs.readFileSync(src, 'utf8'))
  : await (await fetch('https://api.sleeper.app/v1/players/nfl')).json();
const out = {};
for (const [id, p] of Object.entries(all)) {
  if (!POS.has(p.position)) continue;
  if (p.position !== 'DEF' && !p.active) continue; // active players, signed or not (free agents matter for waivers)
  const team = ALIAS[p.team] || p.team || '';
  out[id] = [
    p.position === 'DEF' ? `${p.team} D/ST` : (p.full_name || `${p.first_name} ${p.last_name}`),
    p.position === 'DEF' ? 'DST' : p.position,
    team,
    p.injury_status || '',
    p.espn_id || 0,
    p.number || 0,
  ];
}
fs.writeFileSync('docs/data/index.json', JSON.stringify(out));
const kb = Math.round(fs.statSync('docs/data/index.json').size / 1024);
console.log(`index.json: ${Object.keys(out).length} players, ${kb} KB`);
