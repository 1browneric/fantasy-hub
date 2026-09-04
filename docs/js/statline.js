// Short, scannable stat lines. Labeled fragments only -- never prose.
const n = (s, k) => Number(s?.[k] || 0);
const has = (s, ...k) => k.some(x => n(s, x) !== 0);

export function statLine(stats, pos) {
  if (!stats) return null;
  const out = [];
  const push = (label, val) => out.push(`${label} ${val}`);

  if (pos === 'DST') {
    push('PA', n(stats, 'pts_allow'));
    if (n(stats, 'sack')) push('SACK', n(stats, 'sack'));
    if (n(stats, 'int')) push('INT', n(stats, 'int'));
    if (n(stats, 'fum_rec')) push('FR', n(stats, 'fum_rec'));
    if (n(stats, 'safe')) push('SAF', n(stats, 'safe'));
    const td = n(stats, 'def_td') + n(stats, 'st_td');
    if (td) push('TD', td);
    return out.join('  ');
  }

  if (pos === 'K') {
    push('FG', `${n(stats, 'fgm')}/${n(stats, 'fga')}`);
    push('XP', n(stats, 'xpm'));
    if (n(stats, 'fgm_lng')) push('LNG', n(stats, 'fgm_lng'));
    return out.join('  ');
  }

  if (has(stats, 'pass_yd', 'pass_td', 'pass_att')) {
    push('PASS', `${n(stats, 'pass_cmp')}/${n(stats, 'pass_att')} ${n(stats, 'pass_yd')}yd`);
    if (n(stats, 'pass_td')) push('PTD', n(stats, 'pass_td'));
    if (n(stats, 'pass_int')) push('INT', n(stats, 'pass_int'));
  }
  if (has(stats, 'rush_yd', 'rush_att', 'rush_td')) {
    push('RUSH', `${n(stats, 'rush_att')}-${n(stats, 'rush_yd')}yd`);
    if (n(stats, 'rush_td')) push('RTD', n(stats, 'rush_td'));
  }
  if (has(stats, 'rec', 'rec_yd', 'rec_tgt', 'rec_td')) {
    push('REC', `${n(stats, 'rec')}/${n(stats, 'rec_tgt')} ${n(stats, 'rec_yd')}yd`);
    if (n(stats, 'rec_td')) push('RTD', n(stats, 'rec_td'));
  }
  if (n(stats, 'fum_lost')) push('FUM', n(stats, 'fum_lost'));
  return out.length ? out.join('  ') : null;
}
