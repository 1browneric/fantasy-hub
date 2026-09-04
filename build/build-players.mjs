// Build step: slim Sleeper's 12k-player / 14.6MB file down to just Eric's 45
// rostered players, resolving each to a Sleeper player id and an ESPN player id.
// Output: docs/data/players.json  (committed; the phone never fetches the big file)
import fs from 'node:fs';
import path from 'node:path';

const ROSTER = process.env.ROSTER ||
  path.join(process.env.HOME, 'fantasy-auction/2026/share/my-players.json');
const OUT = path.join(process.cwd(), 'docs/data/players.json');

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// Normalize a personal name for cross-source comparison:
// lowercase, strip punctuation/accents, drop generational suffixes.
export function normName(s) {
  if (!s) return '';
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'`’\-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/).filter(w => w && !SUFFIXES.has(w))
    .join(' ')
    .trim();
}

// Team abbreviation differences between our roster / Sleeper / ESPN.
const TEAM_ALIASES = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
export const normTeam = t => TEAM_ALIASES[(t || '').toUpperCase()] || (t || '').toUpperCase();

// Sleeper calls team defenses DEF; the roster calls them DST.
const normPos = p => (p === 'DST' ? 'DEF' : p);

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
  console.log(`roster: ${roster.length} players`);

  console.log('fetching Sleeper player universe (~14.6MB, build-time only)...');
  const sleeper = await getJSON('https://api.sleeper.app/v1/players/nfl');
  console.log(`sleeper universe: ${Object.keys(sleeper).length} players`);

  // Index Sleeper by "name|team|pos", plus looser fallbacks.
  const byNTP = new Map(), byNP = new Map(), byN = new Map(), byCollapsed = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const [id, p] of Object.entries(sleeper)) {
    const pos = p.position;
    if (!pos) continue;
    const team = normTeam(p.team);
    // Team defenses have no full_name; their key IS the team abbreviation.
    const name = pos === 'DEF' ? id : (p.full_name || `${p.first_name || ''} ${p.last_name || ''}`);
    const n = pos === 'DEF' ? normTeam(id) : normName(name);
    if (!n) continue;
    const rec = { id, name, team, pos, active: p.active, years: p.years_exp };
    add(byNTP, `${n}|${team}|${pos}`, rec);
    add(byNP, `${n}|${pos}`, rec);
    add(byN, n, rec);
    // Apostrophes differ across sources ("De'Von Achane" vs "Devon Achane"),
    // and normName turns them into a space. Collapsing spaces makes those equal.
    add(byCollapsed, `${n.replace(/ /g, '')}|${pos}`, rec);
  }

  const out = [], unmatched = [];
  for (const r of roster) {
    const team = normTeam(r.nfl);
    const pos = normPos(r.pos);
    const n = pos === 'DEF' ? team : normName(r.name);

    // Tiered match: name+team+pos, then name+pos, then name.
    let hit = null, how = null;
    for (const [m, k, label] of [
      [byNTP, `${n}|${team}|${pos}`, 'name+team+pos'],
      [byNP, `${n}|${pos}`, 'name+pos'],
      [byN, n, 'name'],
      [byCollapsed, `${n.replace(/ /g, '')}|${pos}`, 'collapsed-name+pos'],
    ]) {
      const c = m.get(k);
      if (c && c.length === 1) { hit = c[0]; how = label; break; }
      if (c && c.length > 1) {
        const narrowed = c.filter(x => x.team === team && x.pos === pos);
        if (narrowed.length === 1) { hit = narrowed[0]; how = label + '(narrowed)'; break; }
      }
    }

    const entry = {
      name: r.name, pos: r.pos, nfl: team, leagues: r.leagues,
      sleeperId: hit ? hit.id : null, matchedBy: how,
    };
    if (!hit) { entry.unmatched = true; unmatched.push(r.name); }
    out.push(entry);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    count: out.length,
    unmatched: unmatched.length,
    players: out,
  }, null, 1));

  const sz = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`\nwrote ${OUT} (${sz} KB)`);
  console.log(`matched ${out.length - unmatched.length}/${out.length}`);
  if (unmatched.length) {
    console.log('UNMATCHED:', unmatched.join(', '));
    process.exitCode = 0; // surfaced in the UI, not a build failure
  } else {
    console.log('UNMATCHED: none');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
