// Build step: the 32-team identity token map (authentic primary/secondary
// colours + logo URL) from ESPN's public team feed. Output docs/data/teams.json.
// Colour is identity only; every semantic state in the UI is blue vs orange + text.
import fs from 'node:fs';
const ALIAS = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');
if (!r.ok) throw new Error('ESPN teams ' + r.status);
const teams = (await r.json()).sports[0].leagues[0].teams.map(x => x.team);
const out = {};
for (const t of teams) {
  const abbr = ALIAS[t.abbreviation] || t.abbreviation;
  out[abbr] = {
    name: t.displayName, short: t.shortDisplayName, city: t.location,
    primary: '#' + (t.color || '333333').toUpperCase(),
    secondary: '#' + (t.alternateColor || 'FFFFFF').toUpperCase(),
    espn: t.abbreviation.toLowerCase(),
    logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${t.abbreviation.toLowerCase()}.png`,
    logoDark: `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${t.abbreviation.toLowerCase()}.png`,
  };
}
if (Object.keys(out).length !== 32) throw new Error('expected 32 teams, got ' + Object.keys(out).length);
fs.writeFileSync('docs/data/teams.json', JSON.stringify(out, null, 1));
console.log('teams.json: 32 teams', Object.keys(out).sort().join(' '));
