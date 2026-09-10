// ESPN Pick'em: the Big Als confidence pool and Eric's entry in it.
// Every read is anonymous (no cookies). ESPN hides an entry's picks until each
// game locks, so a locked game shows his real pick and an open one shows the
// ladder - the same de-vigged moneyline model the fantasy email submits
// (agents/pickem/pickem.py in home-base).
import { normTeam } from '../util.js';

const G = 'https://gambit-api.fantasy.espn.com/apis/v1';
const CFG = {
  key: 'nfl-pickem-2026', cid: 288, fmt: 2, // 2 = Confidence
  group: '5268a055-e421-4bcf-97fb-8d2212af7dfa',
  entry: '7bc0e1c0-ac77-11f1-b79b-878cc15323ad',
};
export const ENTRY_ID = CFG.entry;

const get = u => fetch(u, { credentials: 'omit', cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error(`Pick'em HTTP ${r.status}`); return r.json(); });
const mapping = (o, k) => (o.mappings || []).find(m => m.type === k)?.value;
const implied = ml => { const o = Number(ml); return o > 0 ? 100 / (o + 100) : -o / (-o + 100); };

export async function load() {
  const filt = encodeURIComponent(JSON.stringify({ filterSortId: { value: 0 }, limit: 200, offset: 0 }));
  const [chal, group, entry] = await Promise.all([
    get(`${G}/challenges/${CFG.key}/?platform=chui&view=chui_default`),
    get(`${G}/challenges/${CFG.cid}/groups/${CFG.group}/?platform=chui&view=chui_default_group&filter=${filt}`),
    get(`${G}/challenges/${CFG.cid}/entries/${CFG.entry}/?platform=chui&view=chui_default_entry`),
  ]);
  return build(chal, group, entry);
}

function build(chal, group, entry) {
  const period = chal.currentScoringPeriod?.id;
  const picks = new Map((entry.picks || []).map(p => [p.propositionId, p]));
  const rows = [];
  for (const p of chal.propositions || []) {
    if (p.scoringPeriodId !== period || p.display === false) continue;
    const outs = (p.possibleOutcomes || []).map(o => {
      const ml = mapping(o, 'BETTING_LINE');
      return {
        id: o.id, abbrev: normTeam(o.abbrev), name: o.name, home: o.subType === 'HOME',
        ml: ml == null || ml === '' ? null : Number(ml),
        pool: (o.choiceCounters || []).find(c => c.scoringFormatId === CFG.fmt)?.percentage ?? null,
      };
    });
    if (outs.length !== 2) continue;
    const priced = outs.every(o => o.ml != null);
    if (priced) { const t = outs.reduce((s, o) => s + implied(o.ml), 0) || 1; for (const o of outs) o.p = implied(o.ml) / t; }
    const mine = picks.get(p.id);
    const pickedId = mine?.outcomesPicked?.[0]?.outcomeId;
    rows.push({
      id: p.id, event: String(mapping(p, 'EVENT_ID') || mapping(p, 'COMPETITION_ID') || ''),
      name: p.name, kickoff: p.date, locked: (p.status || '').toUpperCase() !== 'OPEN',
      outs, fav: priced ? outs.reduce((a, b) => (b.p > a.p ? b : a)) : null,
      picked: pickedId ? outs.find(o => o.id === pickedId) || null : null,
      conf: mine?.confidenceScore ?? null,
      result: mine?.outcomesPicked?.[0]?.result || null, // CORRECT / INCORRECT / undecided
    });
  }
  // the ladder for the games still open: most confident first, taking the
  // confidence values his locked picks have not already used, so no two rows
  // can ever show the same number
  const used = new Set(rows.filter(r => r.picked).map(r => r.conf));
  const free = rows.map((_, i) => rows.length - i).filter(v => !used.has(v));
  rows.filter(r => r.fav && !r.picked && !r.locked).sort((a, b) => b.fav.p - a.fav.p)
    .forEach((r, i) => { r.ladderConf = free[i] ?? null; });
  const entries = group.entries || [];
  return {
    period, label: chal.currentScoringPeriod?.label || `Week ${period}`,
    rows, size: group.size || entries.length, entries,
    me: entries.find(e => e.id === CFG.entry) || null,
    fetched: new Date(),
  };
}
