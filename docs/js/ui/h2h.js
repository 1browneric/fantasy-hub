// Head-to-head: my starters on the left, the opponent's on the right, one
// slot per row, so the whole matchup fits one screen. Bench stays below.
import { el, f1, headshot, teamLogo, paintTeam } from '../util.js';
import { scoreSlot, effectiveSlots } from '../model.js';

const POS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SFLX', 'K', 'DST'];
const posIdx = p => { const i = POS.indexOf(p); return i < 0 ? POS.length : i; };

// Pair starters slot by slot. Sleeper leagues share a fixed slot order, so
// index pairing is exact; RT leagues list starters by position, so pair
// within each position and pad the short side.
function pairs(league, mine, theirs) {
  if (league.platform === 'sleeper') return mine.map((m, i) => [m.slot, m, theirs[i] || null]);
  // RT: pair within a position up to the smaller count; the extra RB/WR/TE
  // on either side are that team's flex plays, so they pair as FLEX rows.
  const out = [], flexA = [], flexB = [];
  const byPos = list => list.reduce((o, s) => { (o[s.slot] = o[s.slot] || []).push(s); return o; }, {});
  const A = byPos(mine), B = byPos(theirs);
  for (const p of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort((a, b) => posIdx(a) - posIdx(b))) {
    const a = A[p] || [], b = B[p] || [], n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) out.push([p, a[i], b[i]]);
    if (['RB', 'WR', 'TE'].includes(p)) { flexA.push(...a.slice(n)); flexB.push(...b.slice(n)); }
    else for (let i = n; i < Math.max(a.length, b.length); i++) out.push([p, a[i] || null, b[i] || null]);
  }
  const k = Math.max(flexA.length, flexB.length);
  const kIdx = out.findIndex(r => posIdx(r[0]) > posIdx('FLEX'));
  const flexRows = []; for (let i = 0; i < k; i++) flexRows.push(['FLEX', flexA[i] || null, flexB[i] || null]);
  out.splice(kIdx < 0 ? out.length : kIdx, 0, ...flexRows);
  return out;
}
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
function shortName(slot) {
  if (slot.pos === 'DST') return `${slot.nfl} D/ST`;
  const w = slot.name.split(' ').filter(x => !SUFFIX.test(x));
  return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : slot.name;
}
function short(g) {
  if (!g) return 'no game';
  if (g.state === 'in') return g.detail;
  if (g.state === 'post') return 'Final';
  return new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
}
function cell(S, league, slot, matchup, right) {
  const c = el('div', 'c' + (right ? ' them' : ' me'));
  if (!slot || slot.empty) { c.appendChild(el('span', 'nm dim', 'Empty')); return c; }
  const r = scoreSlot(league, slot, S.ctx, matchup);
  paintTeam(c, S.T, slot.nfl);
  if (r.state === 'in') c.classList.add('live'); if (r.state === 'post') c.classList.add('done'); if (r.state === 'pre') c.classList.add('pre');
  if (r.state === 'in' && r.game.redzone && r.game.possession === slot.nfl) c.classList.add('rz');
  c.appendChild(el('span', 'bar'));
  c.appendChild(headshot(S.T, slot.pid, slot.name, slot.nfl, 'sm'));
  const t = el('div', 't');
  const nm = el('div', 'nm', shortName(slot)); nm.title = slot.name; if (slot.inj) nm.appendChild(el('span', 'inj', slot.inj.slice(0, 3).toUpperCase())); t.appendChild(nm);
  const sub = el('div', 'sub'); sub.appendChild(teamLogo(S.T, slot.nfl)); sub.appendChild(el('span', null, (r.game ? (r.game.isHome ? 'vs ' : '@ ') + r.game.opp + ' ' : '') + short(r.game))); t.appendChild(sub);
  c.appendChild(t);
  const v = el('div', 'v'); v.appendChild(el('b', null, r.pts == null ? '--' : f1(r.pts))); v.appendChild(el('small', null, f1(r.proj))); c.appendChild(v);
  c.tabIndex = 0; c.setAttribute('role', 'button'); c.onclick = () => S.openPlayer(slot, league); c.onkeydown = e => { if (e.key === 'Enter') S.openPlayer(slot, league); };
  return c;
}
export function h2hPanel(S, league, mm) {
  const panel = el('section', 'panel h2h');
  const mine = effectiveSlots(league, mm.me, S.ctx).filter(s => s.starter);
  const theirs = mm.opp.slots.filter(s => s.starter);
  const head = el('div', 'r hd'); head.appendChild(el('div', 'c me', mm.me.name)); head.appendChild(el('div', 'mid', 'PTS')); head.appendChild(el('div', 'c them', mm.opp.name)); panel.appendChild(head);
  for (const [label, a, b] of pairs(league, mine, theirs)) {
    const row = el('div', 'r');
    row.appendChild(cell(S, league, a, mm.m, false));
    row.appendChild(el('div', 'mid', label));
    row.appendChild(cell(S, league, b, mm.m, true));
    panel.appendChild(row);
  }
  return panel;
}
