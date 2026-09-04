// Fantasy scoring. The SAME stat line is worth different amounts per league,
// so a player owned in two leagues gets two totals.
//
// SoFi + Y60 (RT Sports, rules-identical) are hard-coded from the RT league
// rules page. Boats uses the league's OWN scoring_settings fetched live from
// Sleeper -- never the RT numbers, they differ a lot (6pt vs 4pt pass TD,
// 0.04 vs 0.05 per pass yd, tiered FGs, different points-allowed bands).

const n = (s, k) => Number(s?.[k] || 0);

// ---- RT Sports (SoFi / Y60): full PPR ----
export function scoreRT(s, pos) {
  if (!s) return null;
  let p = 0;
  if (pos === 'DST') {
    p += n(s, 'sack') * 1;
    p += n(s, 'int') * 2;
    p += n(s, 'fum_rec') * 2;
    p += n(s, 'safe') * 2;
    p += (n(s, 'def_td') + n(s, 'st_td')) * 6; // disjoint categories
    const pa = n(s, 'pts_allow');
    if (pa === 0) p += 5;
    else if (pa <= 9) p += 3;
    else if (pa <= 13) p += 1;
    return round2(p);
  }
  if (pos === 'K') {
    p += n(s, 'fgm') * 3;
    p += n(s, 'fgm_yds_over_30') * 0.10; // Sleeper supplies this directly
    p += n(s, 'xpm') * 1;
    return round2(p);
  }
  p += n(s, 'pass_td') * 4;
  p += n(s, 'pass_yd') * 0.05;
  p += n(s, 'pass_int') * -1;
  p += n(s, 'rush_td') * 6;
  p += n(s, 'rush_yd') * 0.10;
  p += n(s, 'rec_td') * 6;
  p += n(s, 'rec_yd') * 0.10;
  p += n(s, 'rec') * 1.0;
  p += n(s, 'fum_lost') * -1;
  p += (n(s, 'pass_2pt') + n(s, 'rush_2pt') + n(s, 'rec_2pt')) * 2;
  return round2(p);
}

// ---- Boats (Sleeper): drive entirely off the league's scoring_settings ----
// Sleeper's stat keys line up 1:1 with its scoring keys (including banded
// values like fgm_40_49 and the pts_allow_* flags), so the league's scoring
// is just a dot product of settings x stats.
export function scoreSleeper(s, settings) {
  if (!s || !settings) return null;
  let p = 0;
  for (const [k, v] of Object.entries(settings)) {
    const stat = s[k];
    if (typeof stat === 'number' && stat !== 0) p += stat * v;
  }
  return round2(p);
}

function round2(x) { return Math.round(x * 100) / 100; }

export function scoreFor(league, stats, pos, boatsSettings) {
  if (league === 'Boats') return scoreSleeper(stats, boatsSettings);
  return scoreRT(stats, pos);
}
