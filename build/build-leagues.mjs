// Bake each league's scoring into docs/data/leagues.json.
// Boats' numbers come from Sleeper's OWN scoring_settings (never the RT ones).
// The app still re-fetches Boats live at runtime; this baked copy is the
// offline/failure fallback so the PWA still scores correctly without network.
import fs from 'node:fs';
const BOATS = '1389390879541727232';

const boats = await (await fetch(`https://api.sleeper.app/v1/league/${BOATS}`)).json();
if (!boats?.scoring_settings) throw new Error('no scoring_settings from Sleeper');

const out = {
  generated: new Date().toISOString(),
  leagues: {
    SoFi: { name: 'Road to SoFi', platform: 'RT Sports', lid: '389290',
            teams: 12, format: '12-team $200 auction, full PPR', engine: 'rt' },
    Y60:  { name: 'Year of the 60', platform: 'RT Sports', lid: '389292',
            teams: 12, format: '12-team $200 auction, full PPR', engine: 'rt' },
    Boats:{ name: boats.name, platform: 'Sleeper', lid: BOATS,
            teams: boats.total_rosters, format: '8-team superflex', engine: 'sleeper',
            scoring: boats.scoring_settings },
  },
};
fs.writeFileSync('docs/data/leagues.json', JSON.stringify(out, null, 1));
console.log(`wrote docs/data/leagues.json — Boats "${boats.name}" ${boats.total_rosters} teams, ${Object.keys(boats.scoring_settings).length} scoring keys`);
console.log(`  spot-check: pass_td=${boats.scoring_settings.pass_td} pass_yd=${boats.scoring_settings.pass_yd} rec=${boats.scoring_settings.rec}`);
