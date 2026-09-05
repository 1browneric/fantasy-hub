// Normalizes the three leagues (two RT Sports, one Sleeper) into ONE shape so
// every view is source-agnostic, and computes live points / projections /
// win probability from that shape.
import { scoreRT, scoreSleeper } from './scoring.js';
import { normName, normTeam, clamp } from './util.js';

export const ELIG = { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DST: ['DST'],
  FLEX: ['RB', 'WR', 'TE'], SFLX: ['QB', 'RB', 'WR', 'TE'], BN: [] };
const SLOT_LABEL = { SUPER_FLEX: 'SFLX', DEF: 'DST', REC_FLEX: 'FLEX' };

// ---------- player index (Sleeper ids) ----------
export function makeLookup(index) {
  const byNTP = new Map(), byNP = new Map(), byN = new Map(), byC = new Map(), byLTP = new Map();
  const put = (m, k, id) => { if (!m.has(k)) m.set(k, []); m.get(k).push(id); };
  for (const [id, [name, pos, team]] of Object.entries(index)) {
    const n = pos === 'DST' ? team.toLowerCase() : normName(name);
    put(byNTP, `${n}|${team}|${pos}`, id); put(byNP, `${n}|${pos}`, id); put(byN, n, id);
    put(byC, n.replace(/\s+/g, '') + '|' + pos, id);                  // "d j moore" == "dj moore"
    put(byLTP, `${n.split(' ').pop()}|${team}|${pos}`, id);             // "Chig" vs "Chigoziem" Okonkwo
  }
  return { index, byNTP, byNP, byN, byC, byLTP };
}
// Tiers, strictest first; a tier only counts when it names exactly one player.
export function matchPlayer(L, name, nfl, pos) {
  if (pos === 'DST') return L.index[normTeam(nfl)] ? normTeam(nfl) : null;
  const n = normName(name), t = normTeam(nfl);
  const one = m => (m && m.length === 1 ? m[0] : null);
  return one(L.byNTP.get(`${n}|${t}|${pos}`)) || one(L.byNP.get(`${n}|${pos}`))
    || one(L.byN.get(n)) || one(L.byC.get(n.replace(/\s+/g, '') + '|' + pos))
    || one(L.byLTP.get(`${n.split(' ').pop()}|${t}|${pos}`)) || null;
}
export const info = (L, pid) => L.index[pid] || null;

// ---------- Boats And Bros (Sleeper) ----------
export function buildBoats(raw, week, L, myHandle) {
  const { lg, users, rosters, matchups } = raw;
  const userById = Object.fromEntries(users.map(u => [u.user_id, u]));
  const positions = lg.roster_positions.filter(p => p !== 'BN');
  const teams = rosters.map(r => {
    const u = userById[r.owner_id] || {};
    const s = r.settings || {};
    const starters = (r.starters || []).map((pid, i) => mkSlot(L, pid, SLOT_LABEL[positions[i]] || positions[i], true));
    const bench = (r.players || []).filter(p => !(r.starters || []).includes(p)).map(pid => mkSlot(L, pid, 'BN', false));
    return {
      id: r.roster_id, name: u.metadata?.team_name || u.display_name || `Team ${r.roster_id}`, owner: u.display_name || '',
      logo: u.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null,
      w: s.wins || 0, l: s.losses || 0, t: s.ties || 0,
      pf: (s.fpts || 0) + (s.fpts_decimal || 0) / 100, pa: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
      faabLeft: (lg.settings?.waiver_budget || 0) - (s.waiver_budget_used || 0), waiverPos: s.waiver_position || null,
      slots: [...starters, ...bench],
    };
  });
  const me = teams.find(t => t.owner === myHandle)?.id ?? null;
  const byMid = {};
  for (const m of matchups) { (byMid[m.matchup_id] = byMid[m.matchup_id] || []).push(m); }
  const ms = Object.values(byMid).filter(x => x.length === 2).map(([a, b]) => ({
    a: a.roster_id, b: b.roster_id, srcA: a.points || 0, srcB: b.points || 0,
    pp: { ...(a.players_points || {}), ...(b.players_points || {}) },
  }));
  const league = { key: 'Boats', name: lg.name, platform: 'sleeper', week, scoring: 'boats', boatsScoring: lg.scoring_settings,
    teams, me, matchups: ms, transactions: [], positions, faab: lg.settings?.waiver_budget || 0 };
  rank(league);
  return league;
}
export function boatsTransactions(league, raw, L) {
  const byId = Object.fromEntries(league.teams.map(t => [t.id, t]));
  const nm = pid => info(L, pid)?.[0] || `#${pid}`;
  league.transactions = raw.filter(t => t.status === 'complete').map(t => ({
    when: new Date(t.created), type: t.type, week: t.leg,
    team: (t.roster_ids || []).map(id => byId[id]?.name || `Team ${id}`).join(' / '),
    adds: Object.keys(t.adds || {}).map(nm), drops: Object.keys(t.drops || {}).map(nm),
    bid: t.settings?.waiver_bid ?? null,
  })).sort((a, b) => b.when - a.when);
}

// ---------- RT Sports (guest JSON from the Actions cron) ----------
export function buildRT(json, L) {
  const st = Object.fromEntries((json.standings || []).map(s => [s.tid, s]));
  const teams = json.teams.map(t => {
    const rec = (t.record || '0-0').split('-').map(Number);
    const s = st[t.tid];
    const slots = t.roster.map(p => {
      const pid = matchPlayer(L, p.name, p.nfl, p.pos);
      return { slot: p.slot === 'starter' ? p.pos : 'BN', starter: p.slot === 'starter', pid, name: p.name, pos: p.pos,
        nfl: normTeam(p.nfl), inj: p.inj || '', unmatched: !pid, rtProj: p.proj || 0, rtHead: p.headshot };
    });
    return { id: t.tid, name: t.name, owner: t.owner, logo: t.logo,
      w: s ? s.w : rec[0] || 0, l: s ? s.l : rec[1] || 0, t: s ? s.t : rec[2] || 0,
      pf: s ? s.pf : 0, pa: null, faabLeft: null, waiverPos: null, projLineup: t.projLineup, slots };
  });
  const league = { key: json.key, name: json.name, platform: 'rtsports', week: json.week, scoring: 'rt',
    teams, me: json.myTeamId, fetchedAt: json.fetchedAt,
    matchups: json.matchups.map(m => ({ a: m.away.tid, b: m.home.tid, srcA: m.away.pts, srcB: m.home.pts, status: m.status, pp: {} })),
    transactions: (json.transactions || []).map(x => ({ when: x.date, type: x.activity, week: x.week, team: x.team, adds: [x.detail], drops: [], bid: null })),
  };
  rank(league);
  return league;
}

function mkSlot(L, pid, slot, starter) {
  if (!pid || pid === '0') return { slot, starter, pid: null, name: 'Empty', pos: '', nfl: '', inj: '', empty: true };
  const i = info(L, pid);
  return { slot, starter, pid, name: i ? i[0] : `#${pid}`, pos: i ? i[1] : '', nfl: i ? i[2] : '', inj: i ? i[3] : '', unmatched: !i };
}
function rank(league) {
  const played = league.teams.some(t => t.w + t.l + t.t > 0);
  const order = [...league.teams].sort((a, b) => (b.w - a.w) || (a.l - b.l) || (b.pf - a.pf));
  order.forEach((t, i) => { t.rank = played ? i + 1 : null; });
  league.order = order.map(t => t.id);
  league.byId = Object.fromEntries(league.teams.map(t => [t.id, t]));
}

// ---------- live math ----------
// ctx = { stats, proj, games, whatIf }
export function projOf(league, slot, ctx) {
  const row = slot.pid ? ctx.proj?.p?.[slot.pid] : null;
  if (row) return league.scoring === 'rt' ? row[0] : row[1];
  return slot.rtProj || 0;
}
export function ptsOf(league, slot, ctx, matchup) {
  if (!slot.pid) return null;
  if (matchup?.pp && slot.pid in matchup.pp && !ctx.debug?.replayStats) return matchup.pp[slot.pid];
  const s = ctx.stats?.[slot.pid];
  const g = ctx.games?.byTeam.get(slot.nfl);
  if (!s) return g && g.state !== 'pre' ? 0 : null;
  return league.scoring === 'rt' ? scoreRT(s, slot.pos) : scoreSleeper(s, league.boatsScoring);
}
export function scoreSlot(league, slot, ctx, matchup) {
  const g = slot.nfl ? ctx.games?.byTeam.get(slot.nfl) : null;
  const pts = ptsOf(league, slot, ctx, matchup);
  const proj = projOf(league, slot, ctx);
  const state = g ? g.state : 'off';
  let projFinal;
  if (state === 'post') projFinal = pts || 0;
  else if (state === 'in') projFinal = (pts || 0) + proj * (1 - g.elapsed);
  else if (state === 'pre') projFinal = proj;
  else projFinal = 0;
  return { pts, proj, projFinal, game: g, state, stats: slot.pid ? ctx.stats?.[slot.pid] : null };
}
export function effectiveSlots(league, team, ctx) {
  const w = ctx.whatIf?.[league.key];
  if (!w || w.team !== team.id) return team.slots;
  // swap: bench pid `w.inPid` takes the starter slot at index `w.slotIdx`
  const slots = team.slots.map(s => ({ ...s }));
  const out = slots[w.slotIdx], inn = slots.find(s => s.pid === w.inPid);
  if (!out || !inn) return team.slots;
  const label = out.slot; out.slot = 'BN'; out.starter = false; inn.slot = label; inn.starter = true;
  return [...slots.filter(s => s.starter), ...slots.filter(s => !s.starter)];
}
export function summarize(league, team, ctx, matchup) {
  const slots = effectiveSlots(league, team, ctx).filter(s => s.starter);
  const out = { pts: 0, projFinal: 0, live: 0, done: 0, left: 0, remainFrac: 0, n: slots.length, rows: [] };
  for (const s of slots) {
    const r = scoreSlot(league, s, ctx, matchup);
    out.rows.push({ slot: s, ...r });
    out.pts += r.pts || 0; out.projFinal += r.projFinal;
    if (r.state === 'in') { out.live++; out.remainFrac += 1 - r.game.elapsed; }
    else if (r.state === 'post') out.done++;
    else if (r.state === 'pre') { out.left++; out.remainFrac += 1; }
  }
  out.remainFrac = out.n ? out.remainFrac / out.n : 0;
  out.yet = out.live + out.left;
  return out;
}
export function winProb(a, b) {
  const diff = a.projFinal - b.projFinal;
  const unc = 8 + 16 * Math.sqrt((a.remainFrac + b.remainFrac) / 2);
  return clamp(1 / (1 + Math.exp(-diff / unc)), 0.01, 0.99);
}
export function myMatchup(league) {
  if (league.me == null) return null;
  const m = league.matchups.find(m => m.a === league.me || m.b === league.me);
  if (!m) return null;
  const oppId = m.a === league.me ? m.b : m.a;
  return { m, me: league.byId[league.me], opp: league.byId[oppId] };
}
export function elig(slotLabel, pos) { return (ELIG[slotLabel] || []).includes(pos); }
