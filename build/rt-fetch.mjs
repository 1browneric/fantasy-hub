// RT Sports guest-page fetcher + parser. No login, no cookies, no secrets.
// Reads three public pages per league (league home, rosters report,
// transactions report) and writes docs/data/rt/<key>.json for the phone.
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
async function get(url, attempt = 0) {
  await sleep(1200);
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  if (r.status === 429 && attempt < 3) { await sleep(20000 * (attempt + 1)); return get(url, attempt + 1); }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const t = await r.text();
  if (/window\.location\s*=\s*"\/login/.test(t)) throw new Error('login wall: ' + url);
  return t;
}

// ---- league home: weekly matchups + standings -------------------------------
export function parseHome(html) {
  const week = num((html.match(/Week (\d+)\s*(?:·|&middot;|&#183;)\s*In Season/) || html.match(/FWK=(\d+)/) || [])[1]);
  const matchups = [];
  const mre = /<a class="home-matchup" href="([^"]+)">([\s\S]*?)<\/a>\s*(?=<a class="home-matchup"|<\/div>)/g;
  let m;
  while ((m = mre.exec(html))) {
    const href = un(m[1]), body = m[2];
    const tm1 = (href.match(/TM1=(\d+)/) || [])[1], tm2 = (href.match(/TM2=(\d+)/) || [])[1];
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
      ? [src(`home_${lg.lid}.html`), src(`rosters_${lg.lid}.html`), src(`tx_${lg.lid}.html`)]
      : [await get(`${BASE}/fantasy-football-league/${lg.lid}`),
         await get(`${BASE}/football/report-rosters.php?${q}`),
         // transactions are the lowest-value page: never let it sink the run
         await get(`${BASE}/football/report-transactions.php?${q}`).catch(e => { console.warn(key, 'transactions skipped:', e.message); return null; })];
    const prevPath = path.join(OUT, `${key}.json`);
    const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : null;
    const H = parseHome(home), T = parseRosters(rosters), X = tx ? parseTransactions(tx) : (prev?.transactions || []);
    const mine = seed.filter(p => p.leagues.includes(key));
    const myTeamId = detectMyTeam(T, mine);
    if (!T.length || !H.matchups.length) throw new Error(`${key}: parse produced ${T.length} teams / ${H.matchups.length} matchups`);
    if (!myTeamId) throw new Error(`${key}: could not detect my team from roster overlap`);
    const out = {
      key, name: lg.name, lid: lg.lid, platform: 'rtsports',
      fetchedAt: new Date().toISOString(), week: H.week,
      myTeamId, teams: T, matchups: H.matchups, standings: H.standings, transactions: X,
    };
    fs.writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify(out));
    console.log(`${key}: week ${H.week}, ${T.length} teams, ${H.matchups.length} matchups, ${H.standings.length} standings rows, ${X.length} transactions, my team ${myTeamId} (${T.find(t => t.tid === myTeamId).name})`);
  }
}
main().catch(e => { console.error('rt-fetch FAILED:', e.message); process.exit(1); });
