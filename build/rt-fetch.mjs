// RT Sports guest-page fetcher + parser. No login, no cookies, no secrets.
// Reads four public sources per league (league home, rosters report,
// transactions report, and the gamecast provider JSON for the current week)
// and writes docs/data/rt/<key>.json for the phone.
// Runs on a GitHub Actions cron; also runnable locally.
//   node build/rt-fetch.mjs                # fetch live
//   node build/rt-fetch.mjs --from DIR     # parse saved HTML (tests)
import fs from 'node:fs';
import path from 'node:path';

const LEAGUES = {
  SoFi: { lid: '389290', name: 'Road to SoFi' },
  Y60:  { lid: '389292', name: 'Year of the 60' },
};
const BASE = 'https://www.rtsports.com';
const UA = 'Mozilla/5.0 (fantasy-hub; +https://github.com/1browneric/fantasy-hub)';
const args = process.argv.slice(2);
const FROM = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
const OUT = path.join(process.cwd(), 'docs/data/rt');

const un = s => String(s ?? '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const text = html => un(html.replace(/<[^>]+>/g, ' '));
const num = s => { const n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const attr = (html, name) => { const m = html.match(new RegExp(name + '="([^"]*)"')); return m ? un(m[1]) : ''; };
const TEAM_ALIAS = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
const normTeam = t => TEAM_ALIAS[t] || t;

const sleep = ms => new Promise(r => setTimeout(r, ms));
// RT rate-limits bursts (429 on the 6th quick request). Sequential, spaced,
// with backoff -- six pages a run is all we ever need.
async function get(url, attempt = 0, accept = 'text/html') {
  await sleep(1200);
  const r = await fetch(url, { headers: { 'user-agent': UA, accept }, redirect: 'follow' });
  if (r.status === 429 && attempt < 3) { await sleep(20000 * (attempt + 1)); return get(url, attempt + 1, accept); }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const t = await r.text();
  if (/window\.location\s*=\s*"\/login/.test(t)) throw new Error('login wall: ' + url);
  return t;
}
const getJson = async url => JSON.parse(await get(url, 0, 'application/json'));

// ---- league home: weekly matchups + standings -------------------------------
export function parseHome(html) {
  const week = num((html.match(/Week (\d+)\s*(?:·|&middot;|&#183;)\s*In Season/) || html.match(/FWK=(\d+)/) || [])[1]);
  const matchups = [];
  const mre = /<a class="home-matchup" href="([^"]+)">([\s\S]*?)<\/a>\s*(?=<a class="home-matchup"|<\/div>)/g;
  let m;
  while ((m = mre.exec(html))) {
    const href = un(m[1]), body = m[2];
    const tm1 = (href.match(/TM1=(\d+)/) || [])[1], tm2 = (href.match(/TM2=(\d+)/) || [])[1];
    const fwk = num((href.match(/FWK=(\d+)/) || [])[1]) || null;
    const sides = [...body.matchAll(/<div class="home-side( away)?">([\s\S]*?)<\/div>\s*<\/div>/g)].map(s => ({
      name: text((s[2].match(/home-match-name">([^<]*)/) || [, ''])[1]),
      record: text((s[2].match(/home-match-record[^>]*>([^<]*)/) || [, ''])[1]),
      logo: attr(s[2], 'src'),
    }));
    const scores = [...body.matchAll(/home-score-line[^>]*>\s*<span>([^<]*)<\/span>[\s\S]*?<span>([^<]*)<\/span>/g)][0] || [];
    const status = text((body.match(/home-score-meta">([^<]*)/) || [, ''])[1]);
    if (sides.length !== 2) continue;
    matchups.push({
      away: { tid: tm1, ...sides[0], pts: num(scores[1]) },
      home: { tid: tm2, ...sides[1], pts: num(scores[2]) },
      status,   // "Live" | "Final" | kickoff text
      fwk,      // the week this card is for: RT keeps last week's finals up until the new week's first kickoff
    });
  }
  const standings = [];
  const sb = (html.match(/<article class="home-card" data-home-card="standings"[\s\S]*?<\/article>/) || [''])[0];
  let division = '';
  for (const row of sb.matchAll(/<tr class="([^"]*)">([\s\S]*?)<\/tr>/g)) {
    if (row[1].includes('home-division-row')) { division = text(row[2]); continue; }
    if (row[1].includes('home-division-columns')) continue;
    const tds = [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
    if (tds.length < 6) continue;
    standings.push({
      division, rank: text(tds[0]) === '-' ? null : num(tds[0]),
      tid: (tds[1].match(/TID=(\d+)/) || [])[1], name: text((tds[1].match(/home-mini-name[^>]*>([^<]*)/) || [, ''])[1]),
      logo: attr(tds[1], 'src'), w: num(tds[2]), l: num(tds[3]), t: num(tds[4]), pf: num(tds[5]),
    });
  }
  return { week, matchups, standings };
}

// ---- gamecast provider: the current week's matchups ------------------------
// The league home's Weekly Matchups card keeps showing the finished week until
// the new week's first kickoff (2026-09-15, a Tuesday: header "Week 2", every
// card a week-1 Final), so a Tuesday-to-Thursday hub showed last week's
// opponent. /football/gamecast-provider.php?LID&UID&FWK&TM1&TM2 is the JSON
// the gamecast page polls; as a guest it answers for any two team ids and its
// fantasyGames array is every matchup of FWK, with live scores once games
// start. That is the week's schedule; the home card is only the fallback.
export function parseProvider(json) {
  if (!json || json.ok === false || !json.league) return null;
  const side = t => ({ tid: String(t.id), name: un(t.name), record: un(t.record || ''), logo: un(t.logo || ''), pts: num(t.score) });
  const status = st => /final/i.test(st) ? 'Final' : /live|progress|active/i.test(st) ? 'Live' : 'Upcoming';
  const matchups = (json.fantasyGames || []).map(g => ({ away: side(g.away), home: side(g.home), status: status(g.state || ''), fwk: num(json.league.fantasyWeek) || null }));
  return { week: num(json.league.fantasyWeek) || null, matchups };
}
const providerSide = t => ({ tid: String(t.id), name: un(t.name), record: un(t.record || ''), logo: un(t.logo || ''), pts: num(t.score) });
// The provider's own matchup block answers for the pair it was asked about
// even while fantasyGames is empty (Road to SoFi, 2026-09-15 12:35 UTC: every
// pair, both weeks, zero games for an hour while Year of the 60 answered
// fine), so with the week's pair from the capsule it is my matchup, scored.
export function providerMatchup(json, week) {
  const m = json?.matchup;
  if (!json || json.ok === false || !m?.away?.id || !m?.home?.id) return null;
  const final = m.away.final && m.home.final;
  const started = num(m.away.score) > 0 || num(m.home.score) > 0 || (m.away.pmr != null && m.away.maxPmr != null && m.away.pmr < m.away.maxPmr);
  return { away: providerSide(m.away), home: providerSide(m.home), status: final ? 'Final' : started ? 'Live' : 'Upcoming', fwk: num(json.league?.fantasyWeek) || week || null };
}
// team-capsules.php?TID=<mine> (guest): "Game Schedule / This week · Week N"
// links the week's gamecast with TM1, TM2 and FWK - the pair to ask the
// provider about.
export function parseCapsule(html) {
  const m = html.match(/This week[\s\S]{0,400}?gamecast\.php\?([^"]+)"/) || html.match(/gamecast\.php\?([^"]*FWK=\d+[^"]*)"/);
  if (!m) return null;
  const q = un(m[1]);
  const g = k => (q.match(new RegExp(k + '=(\\d+)')) || [])[1];
  return g('TM1') && g('TM2') ? { tm1: g('TM1'), tm2: g('TM2'), fwk: num(g('FWK')) || null } : null;
}
// The week's matchups, first source that has them:
//   provider  - fantasyGames for the header week (the whole week, live scores)
//   home      - the home card's rows for the header week
//   capsule   - my matchup alone, from the capsule's pair scored by the provider
//   carried   - the matchups the last run wrote, when they were this week's
//   home-stale- whatever the card holds (last week), labelled with its week
//   carried-stale - the last run's matchups, whatever week, rather than nothing
export function pickMatchups(home, provider, mine = null, prev = null) {
  const week = home.week || provider?.week || null;
  if (provider && provider.matchups.length && (!week || provider.week === week)) {
    return { week, matchupsWeek: provider.week, matchups: provider.matchups, source: 'provider' };
  }
  const current = home.matchups.filter(m => m.fwk === week);
  if (current.length) return { week, matchupsWeek: week, matchups: current, source: 'home' };
  if (mine && (!week || mine.fwk === week)) return { week, matchupsWeek: mine.fwk, matchups: [mine], source: 'capsule' };
  if (prev?.matchups?.length && week && prev.matchupsWeek === week) return { week, matchupsWeek: week, matchups: prev.matchups, source: 'carried' };
  const weeks = [...new Set(home.matchups.map(m => m.fwk).filter(Boolean))];
  if (home.matchups.length) return { week, matchupsWeek: weeks.length === 1 ? weeks[0] : null, matchups: home.matchups, source: 'home-stale' };
  if (prev?.matchups?.length) return { week, matchupsWeek: prev.matchupsWeek ?? null, matchups: prev.matchups, source: 'carried-stale' };
  return { week, matchupsWeek: null, matchups: [], source: 'none' };
}

// ---- rosters report ---------------------------------------------------------
export function parseRosters(html) {
  const teams = [];
  for (const sec of html.matchAll(/<section class="rr-team-card[^"]*">([\s\S]*?)<\/section>/g)) {
    const h = sec[1];
    const tid = (h.match(/TID=(\d+)/) || [])[1];
    const name = text((h.match(/rr-team-name">([^<]*)/) || [, ''])[1]);
    const ownerRaw = (h.match(/rr-team-owner">([\s\S]*?)<\/div>/) || [, ''])[1];
    const owner = text(ownerRaw.replace(/<span>[\s\S]*?<\/span>/, ''));
    const record = text((ownerRaw.match(/<span>([^<]*)<\/span>/) || [, ''])[1]);
    const logo = attr((h.match(/<img class="rr-team-logo"[^>]*>/) || [''])[0], 'src');
    const kpis = [...h.matchAll(/<strong>([^<]*)<\/strong><span>([^<]*)<\/span>/g)]
      .reduce((o, k) => { o[text(k[2])] = num(k[1]); return o; }, {});
    const roster = [];
    for (const tr of h.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const r = tr[1]; if (!r.includes('rr-player-name')) continue;
      const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
      const pos = text((r.match(/pos-badge pos-([A-Z]+)/) || [, ''])[1]);
      const pname = text((r.match(/pos-badge[^>]*>[^<]*<\/span><span>([^<]*)<\/span>/) || [, ''])[1]);
      const nfl = normTeam(attr((r.match(/<span class="team-logo[^>]*>/) || [''])[0], 'title'));
      const pills = [...r.matchAll(/player-meta-pill">([^<]*)<\/span>/g)].map(x => text(x[1]));
      const rtId = (r.match(/headshot\/(\d+)/) || [])[1] || null;
      roster.push({
        name: pname, pos: (pos === 'DEF' || pos === 'D' || pos === 'DST') ? 'DST' : pos, nfl, rtId,
        slot: text(tds[1] || '').toLowerCase().includes('starter') ? 'starter' : text(tds[1] || '').toLowerCase(),
        inj: text(tds[2] || '') === '-' ? '' : text(tds[2] || ''),
        opp: pills.find(p => !/^Bye/i.test(p)) || '',
        game: text(tds[3] || ''), proj: num(tds[4]),
        headshot: rtId ? `https://cloudfront.rtsports.com/football/headshot/${rtId}` : null,
      });
    }
    teams.push({ tid, name, owner, record, logo, projLineup: kpis['Proj lineup'] || 0, roster });
  }
  return teams;
}

// ---- transactions report ----------------------------------------------------
export function parseTransactions(html) {
  const tbl = (html.match(/<div class="tx-table"[\s\S]*?<\/div>\s*<div class="tx-empty" id="txNoMatches"/) || [''])[0];
  const rows = [];
  for (const row of tbl.matchAll(/<div class="tx-row[^"]*"([^>]*)>([\s\S]*?)<\/div>\s*(?=<div class="tx-row|<\/div>)/g)) {
    const cells = [...row[2].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)].map(x => text(x[1]));
    rows.push({ date: cells[0] || '', activity: cells[1] || '', team: cells[2] || '', detail: cells[3] || '', source: cells[4] || '', week: num(cells[5]) });
  }
  return rows;
}

// ---- my team detection: the RT team holding the most of my known players ----
function detectMyTeam(teams, mine) {
  const key = p => `${p.name.toLowerCase().replace(/[^a-z]/g, '')}|${p.pos}`;
  const want = new Set(mine.map(key));
  let best = null, bestN = 0;
  for (const t of teams) {
    const n = t.roster.filter(p => want.has(key(p))).length;
    if (n > bestN) { best = t; bestN = n; }
  }
  return bestN >= 5 ? best.tid : null; // 5+ overlaps = unambiguous
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/data/my-players.json'), 'utf8'));
  for (const [key, lg] of Object.entries(LEAGUES)) {
    const q = `LID=${lg.lid}&UID=fantasyfootball`;
    const src = FROM
      ? f => fs.readFileSync(path.join(FROM, f), 'utf8')
      : null;
    const [home, rosters, tx] = FROM
      ? [src(`home_${lg.lid}.html`), src(`rosters_${lg.lid}.html`), fs.existsSync(path.join(FROM, `tx_${lg.lid}.html`)) ? src(`tx_${lg.lid}.html`) : null]
      : [await get(`${BASE}/fantasy-football-league/${lg.lid}`),
         await get(`${BASE}/football/report-rosters.php?${q}`),
         // transactions are the lowest-value page: never let it sink the run
         await get(`${BASE}/football/report-transactions.php?${q}`).catch(e => { console.warn(key, 'transactions skipped:', e.message); return null; })];
    const prevPath = path.join(OUT, `${key}.json`);
    const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : null;
    const H = parseHome(home), T = parseRosters(rosters), X = tx ? parseTransactions(tx) : (prev?.transactions || []);
    if (!T.length) throw new Error(`${key}: parse produced no teams`);
    const mine = seed.filter(p => p.leagues.includes(key));
    const myTeamId = detectMyTeam(T, mine);
    if (!myTeamId) throw new Error(`${key}: could not detect my team from roster overlap`);
    // the week's matchups (see parseProvider); any two team ids will do, the
    // provider answers with the whole week either way
    const fromFile = (f, json) => fs.existsSync(path.join(FROM, f)) ? (json ? JSON.parse(src(f)) : src(f)) : null;
    const provider = (tm1, tm2) => FROM ? fromFile(`provider_${lg.lid}.json`, true)
      : getJson(`${BASE}/football/gamecast-provider.php?${q}&FWK=${H.week}&TM1=${tm1}&TM2=${tm2}`);
    let P = null, my = null;
    try {
      const pj = await provider(T[0].tid, T[1].tid);
      P = parseProvider(pj);
      console.log(`${key}: provider week ${P?.week ?? '?'}, ${P?.matchups.length ?? 0} matchups` + (P ? '' : ` (unusable: ${JSON.stringify(pj).slice(0, 120)})`));
      if (!P?.matchups.length && !H.matchups.some(m => m.fwk === H.week)) {
        // the week's list is empty everywhere: my capsule names my pair, the provider scores it
        const cap = parseCapsule(FROM ? (fromFile(`capsule_${lg.lid}.html`) || '') : await get(`${BASE}/football/team-capsules.php?${q}&TID=${myTeamId}`));
        if (cap) my = providerMatchup(await provider(cap.tm1, cap.tm2), cap.fwk);
        if (my) my.fwk = cap.fwk || my.fwk;
        console.log(`${key}: capsule ${cap ? `week ${cap.fwk} ${cap.tm1} vs ${cap.tm2}` : 'no pair'}, provider matchup ${my ? `${my.away.name} vs ${my.home.name} (${my.status})` : 'none'}`);
      }
    } catch (e) { console.warn(key, 'provider skipped:', e.message); }
    const M = pickMatchups(H, P, my, prev);
    if (/stale|none/.test(M.source)) console.warn(`${key}: week ${M.week} header but the matchups on hand are ${M.source} (week ${M.matchupsWeek ?? '?'})`);
    if (!M.matchups.length) throw new Error(`${key}: parse produced ${T.length} teams / 0 matchups`);
    const out = {
      key, name: lg.name, lid: lg.lid, platform: 'rtsports',
      fetchedAt: new Date().toISOString(), week: M.week, matchupsWeek: M.matchupsWeek, matchupsSource: M.source,
      myTeamId, teams: T, matchups: M.matchups, standings: H.standings, transactions: X,
    };
    fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify(out));
    const mm = M.matchups.find(m => m.away.tid === myTeamId || m.home.tid === myTeamId);
    const opp = mm ? (mm.away.tid === myTeamId ? mm.home.name : mm.away.name) : 'none';
    console.log(`${key}: week ${M.week}, ${T.length} teams, ${M.matchups.length} matchups (${M.source}, week ${M.matchupsWeek}), ${H.standings.length} standings rows, ${X.length} transactions, my team ${myTeamId} (${T.find(t => t.tid === myTeamId).name}) vs ${opp}`);
  }
}
// Only the CLI runs the fetch; tests import the parsers without touching RT.
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().catch(e => { console.error('rt-fetch FAILED:', e.message); process.exit(1); });
}
