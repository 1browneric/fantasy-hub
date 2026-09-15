// node --test tests/  -- RT guest data: the week's matchups come from the
// gamecast provider, because the league home's Weekly Matchups card keeps
// last week's finals up until the new week's first kickoff. Fixtures captured
// Tuesday 2026-09-15 12:30 UTC, when the header said week 2 and the card was
// still week 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHome, parseProvider, providerMatchup, parseCapsule, pickMatchups } from '../build/rt-fetch.mjs';

const home = parseHome(readFileSync(new URL('./fixtures/rt-home-weekly-scores-389290-2026w2.html', import.meta.url), 'utf8'));
const provider = parseProvider(JSON.parse(readFileSync(new URL('./fixtures/rt-provider-389290-2026w2.json', import.meta.url), 'utf8')));

test('league home: week 2 header, but every card is a week-1 final', () => {
  assert.equal(home.week, 2);
  assert.equal(home.matchups.length, 6);
  assert.deepEqual([...new Set(home.matchups.map(m => m.fwk))], [1]);
  assert.ok(home.matchups.every(m => m.status === 'Final'));
  const mine = home.matchups.find(m => m.away.tid === '7196409');
  assert.equal(mine.home.name, 'Tallahassee Titans 1');   // last week's opponent
  assert.equal(mine.away.pts, 168.6);
});

test('provider: the week-2 schedule, every matchup, no scores yet', () => {
  assert.equal(provider.week, 2);
  assert.equal(provider.matchups.length, 6);
  assert.ok(provider.matchups.every(m => m.fwk === 2 && m.status === 'Upcoming' && m.away.pts === 0 && m.home.pts === 0));
  const mine = provider.matchups.find(m => m.away.tid === '7196409');
  assert.deepEqual(mine.away, { tid: '7196409', name: 'SoFi Kings', record: '1-0', logo: 'https://cloudfront.rtsports.com/logos/fbteam-389290-7196409-2328.jpg', pts: 0 });
  assert.equal(mine.home.tid, '7196439');
  assert.equal(mine.home.name, 'Losing It 9-3a');          // this week's opponent
  assert.equal(parseProvider(null), null);
  assert.equal(parseProvider({ ok: false }), null);
});

test('pickMatchups prefers the provider for the header week', () => {
  const m = pickMatchups(home, provider);
  assert.equal(m.source, 'provider'); assert.equal(m.week, 2); assert.equal(m.matchupsWeek, 2);
  assert.equal(m.matchups.find(x => x.away.tid === '7196409').home.name, 'Losing It 9-3a');
});

test('pickMatchups: a provider answering for another week is ignored', () => {
  const m = pickMatchups(home, { week: 3, matchups: provider.matchups });
  assert.equal(m.source, 'home-stale'); assert.equal(m.week, 2); assert.equal(m.matchupsWeek, 1);
  assert.equal(m.matchups.length, 6);
});

test('pickMatchups: without the provider, the card rows for the header week win, else last week stays and is labelled', () => {
  const stale = pickMatchups(home, null);
  assert.equal(stale.source, 'home-stale'); assert.equal(stale.week, 2); assert.equal(stale.matchupsWeek, 1);
  const flipped = { ...home, matchups: home.matchups.map(x => ({ ...x, fwk: 2, status: 'Sun 12:00pm CT' })) };
  const cur = pickMatchups(flipped, null);
  assert.equal(cur.source, 'home'); assert.equal(cur.matchupsWeek, 2); assert.equal(cur.matchups.length, 6);
});

// The Road to SoFi outage later that morning (12:35 UTC on): the home card had
// no rows at all and the provider's fantasyGames was empty for every pair and
// both weeks, while its matchup block still answered for the pair asked.
const providerJson = JSON.parse(readFileSync(new URL('./fixtures/rt-provider-389290-2026w2.json', import.meta.url), 'utf8'));
const emptyHome = { week: 2, matchups: [], standings: [] };
const emptyProvider = { week: 2, matchups: [] };
const capsule = parseCapsule(readFileSync(new URL('./fixtures/rt-capsule-389290-7196409-2026w2.html', import.meta.url), 'utf8'));

test('capsule: my pair for the week', () => {
  assert.deepEqual(capsule, { tm1: '7196409', tm2: '7196439', fwk: 2 });
  assert.equal(parseCapsule('<html>no schedule here</html>'), null);
});

test('providerMatchup: the pair asked about, scored, whatever fantasyGames holds', () => {
  const my = providerMatchup({ ...providerJson, fantasyGames: [] }, 2);
  assert.equal(my.away.tid, '7196409'); assert.equal(my.away.name, 'SoFi Kings'); assert.equal(my.away.record, '1-0');
  assert.equal(my.home.tid, '7212704'); assert.equal(my.status, 'Upcoming'); assert.equal(my.fwk, 2);
  const live = providerMatchup({ ...providerJson, matchup: { away: { ...providerJson.matchup.away, score: 12.3, pmr: 400, maxPmr: 540 }, home: { ...providerJson.matchup.home, score: 0 } } }, 2);
  assert.equal(live.status, 'Live'); assert.equal(live.away.pts, 12.3);
  const fin = providerMatchup({ ...providerJson, matchup: { away: { ...providerJson.matchup.away, final: true, score: 101.5 }, home: { ...providerJson.matchup.home, final: true, score: 99 } } }, 2);
  assert.equal(fin.status, 'Final');
  assert.equal(providerMatchup(null, 2), null);
  assert.equal(providerMatchup({ ok: true, matchup: {} }, 2), null);
});

test('pickMatchups during the outage: capsule pair, then the last run, never a blank week', () => {
  const my = { away: { tid: '7196409', name: 'SoFi Kings', record: '1-0', logo: '', pts: 0 }, home: { tid: '7196439', name: 'Losing It 9-3a', record: '0-1', logo: '', pts: 0 }, status: 'Upcoming', fwk: 2 };
  const c = pickMatchups(emptyHome, emptyProvider, my, null);
  assert.equal(c.source, 'capsule'); assert.equal(c.matchupsWeek, 2); assert.deepEqual(c.matchups, [my]);
  const prev = { matchupsWeek: 2, matchups: provider.matchups };
  const carried = pickMatchups(emptyHome, emptyProvider, null, prev);
  assert.equal(carried.source, 'carried'); assert.equal(carried.matchups.length, 6);
  const older = pickMatchups(emptyHome, emptyProvider, null, { matchupsWeek: 1, matchups: home.matchups });
  assert.equal(older.source, 'carried-stale'); assert.equal(older.matchupsWeek, 1);
  assert.equal(pickMatchups(emptyHome, emptyProvider, { ...my, fwk: 1 }, null).source, 'none');
  // a capsule for the header week beats last week's card rows
  assert.equal(pickMatchups(home, emptyProvider, my, prev).source, 'capsule');
});
