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
