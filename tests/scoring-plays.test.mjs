// node --test tests/  -- parser for ESPN's per-game summary: the scoring plays
// with the running score after each, and the drive line for offensive scores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScoring } from '../docs/js/sources/espn.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/summary-tb-cin-2026w1.json', import.meta.url)));

test('every scoring play, in game order, with the score after it', () => {
  const plays = parseScoring(fx, 'CIN', 'TB');
  assert.equal(plays.length, 12);
  assert.deepEqual(plays[0], {
    id: '401872925340', period: 1, clock: '9:09', team: 'TB', kind: 'Field Goal', type: 'Field Goal Good',
    text: 'Chase McLaughlin 34 Yd Field Goal', awayScore: 3, homeScore: 0, drive: '11 plays, 56 yards, 5:51',
  });
  const last = plays[11];
  assert.equal(last.team, 'TB'); assert.equal(last.period, 4); assert.equal(last.clock, '3:19');
  assert.equal(last.awayScore, 27); assert.equal(last.homeScore, 33);
  assert.equal(last.drive, '7 plays, 51 yards, 2:00');
});

test('defensive scores carry no drive line: the drive on file belongs to the team that turned it over', () => {
  const plays = parseScoring(fx, 'CIN', 'TB');
  const fumble = plays.find(p => p.type === 'Sack Opp Fumble Recovery');
  assert.equal(fumble.kind, 'Touchdown'); assert.equal(fumble.team, 'CIN'); assert.equal(fumble.drive, '');
  const pick = plays.find(p => p.type === 'Interception Return Touchdown');
  assert.equal(pick.team, 'TB'); assert.equal(pick.drive, '');
});

test('team abbreviations are normalised to the app\'s (WSH -> WAS)', () => {
  const d = { scoringPlays: [{ id: '1', type: { text: 'Passing Touchdown' }, text: 'x', awayScore: 7, homeScore: 0,
    period: { number: 2 }, clock: { displayValue: '0:12' }, team: { abbreviation: 'WSH' }, scoringType: { displayName: 'Touchdown' } }] };
  assert.equal(parseScoring(d, 'PHI', 'WAS')[0].team, 'WAS');
});

test('an empty or missing list parses to no plays', () => {
  assert.deepEqual(parseScoring({}, 'A', 'B'), []);
  assert.deepEqual(parseScoring({ scoringPlays: [] }, 'A', 'B'), []);
});

// ---- box score ----
import { parseBox } from '../docs/js/sources/espn.js';

test('team stats: every row, away then home, in ESPN order', () => {
  const box = parseBox(fx, 'CIN', 'TB');
  assert.deepEqual(box.teams.map(t => t.team), ['TB', 'CIN']);
  assert.equal(box.teams[0].stats.length, 25);
  assert.deepEqual(box.teams[0].stats[0], ['1st Downs', '19']);
  assert.deepEqual(box.teams[1].stats.find(s => s[0] === 'Possession'), ['Possession', '31:25']);
});

test('player stats by group with labels, rows and totals; empty groups dropped', () => {
  const box = parseBox(fx, 'CIN', 'TB');
  const tb = box.players.find(p => p.team === 'TB');
  const pass = tb.groups.find(g => g.name === 'passing');
  assert.deepEqual(pass.labels, ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'RTG']);
  assert.equal(pass.label, 'Passing');
  assert.deepEqual(pass.rows[0], { id: '3052587', name: 'Baker Mayfield', stats: ['23/28', '216', '7.7', '0', '0', '4-23', '98.8'] });
  assert.deepEqual(pass.totals, ['23/28', '193', '7.7', '0', '0', '4-23', '98.8']);
  assert.equal(tb.groups.some(g => g.name === 'punting'), false, 'TB never punted; the empty group is not shown');
  assert.ok(tb.groups.find(g => g.name === 'defensive').rows.length >= 15);
});

test('leaders: one per category per team', () => {
  const box = parseBox(fx, 'CIN', 'TB');
  const cin = box.leaders.find(l => l.team === 'CIN');
  const p = cin.cats.find(c => c.name === 'passingYards');
  assert.equal(p.label, 'Passing Yards'); assert.equal(p.who, 'Joe Burrow'); assert.equal(p.id, '3915511');
  assert.equal(p.value, '25/35, 254 YDS, 1 TD, 1 INT');
});

test('a summary with no box score parses to an empty box', () => {
  assert.deepEqual(parseBox({}, 'A', 'B'), { teams: [], players: [], leaders: [] });
});
