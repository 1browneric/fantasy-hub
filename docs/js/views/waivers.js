// Waivers: suggested pickups by projected points under THIS league's scoring,
// with Sleeper's trending-add counts as the crowd signal, then every move.
import { el, f1, headshot, teamLogo, paintTeam, tag } from '../util.js';
import { normName, normTeam } from '../util.js';
import { info, myMatchup, scoreSlot, effectiveSlots, projOf } from '../model.js';

export function render(S, main) {
  const f = S.state.wf || (S.state.wf = { lg: S.state.lg });
  const chips = el('div', 'chips');
  for (const k of ['SoFi', 'Y60', 'Boats']) { const b = el('button', 'chip', k); b.setAttribute('aria-pressed', String(f.lg === k)); b.onclick = () => { f.lg = k; S.render(); }; chips.appendChild(b); }
  main.appendChild(chips);
  const L = S.leagues[f.lg]; if (!L) { main.appendChild(el('div', 'empty', 'Not loaded')); return; }
  // rostered set in this league (by Sleeper id, and by name|pos for RT unmatched)
  const taken = new Set(), takenNP = new Set();
  for (const T of L.teams) for (const s of T.slots) { if (s.pid) taken.add(s.pid); takenNP.add(normName(s.name) + '|' + s.pos); }
  const me = L.byId[L.me];
  // my weakest starting positions by projected final
  const need = {};
  if (me) for (const s of effectiveSlots(L, me, S.ctx).filter(x => x.starter)) { const pf = scoreSlot(L, s, S.ctx, myMatchup(L)?.m).projFinal; need[s.pos] = Math.min(need[s.pos] ?? 99, pf); }
  const trend = S.cache.trending || {};
  const cands = [];
  for (const [pid, [name, pos, team, inj]] of Object.entries(S.index)) {
    if (taken.has(pid) || takenNP.has(normName(name) + '|' + pos)) continue;
    const slot = { pid, name, pos, nfl: team, inj };
    const proj = projOf(L, slot, S.ctx); if (!proj) continue;
    cands.push({ slot, proj, trend: trend[pid] || 0, gain: need[pos] != null ? proj - need[pos] : null });
  }
  cands.sort((a, b) => b.proj - a.proj);
  const h = el('div', 'h'); h.appendChild(el('h2', null, 'Suggested pickups')); h.appendChild(el('span', 'sub', `${L.key} scoring, week ${S.state.week} projections`)); main.appendChild(h);
  const panel = el('section', 'panel');
  const pc = el('div', 'chips'); const posf = f.pos || 'ALL';
  for (const p of ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']) { const b = el('button', 'chip', p); b.setAttribute('aria-pressed', String(posf === p)); b.onclick = () => { f.pos = p; S.render(); }; pc.appendChild(b); }
  panel.appendChild(pc);
  const ul = el('ul', 'rows');
  for (const c of cands.filter(c => posf === 'ALL' || c.slot.pos === posf).slice(0, 15)) {
    const li = paintTeam(el('li', 'row clickable'), S.T, c.slot.nfl); li.tabIndex = 0;
    li.appendChild(el('span', 'bar')); const sl = el('span', 'slot', c.slot.pos); li.appendChild(sl);
    li.appendChild(headshot(S.T, c.slot.pid, c.slot.name, c.slot.nfl));
    const who = el('div', 'who'); const nm = el('div', 'nm', c.slot.name); if (c.slot.inj) nm.appendChild(el('span', 'inj', c.slot.inj.slice(0, 4).toUpperCase())); who.appendChild(nm);
    const meta = el('div', 'meta'); meta.appendChild(teamLogo(S.T, c.slot.nfl)); meta.appendChild(el('span', null, c.slot.nfl));
    if (c.trend) meta.appendChild(el('span', null, `${c.trend.toLocaleString()} adds in 24h`)); who.appendChild(meta);
    who.appendChild(el('div', 'line', c.gain != null ? (c.gain > 0 ? `Upgrade: +${f1(c.gain)} over your lowest ${c.slot.pos} starter` : `Depth: ${f1(-c.gain)} under your lowest ${c.slot.pos} starter`) : 'Depth pickup'));
    li.appendChild(who);
    const pts = el('div', 'pts'); pts.appendChild(el('div', 'v', f1(c.proj))); pts.appendChild(el('div', 'p', 'proj')); li.appendChild(pts);
    li.onclick = () => S.openPlayer(c.slot, L);
    ul.appendChild(li);
  }
  if (!ul.children.length) ul.appendChild(el('li', 'empty', 'No projected free agents at this position'));
  panel.appendChild(ul);
  panel.appendChild(el('div', 'note', L.faab ? `FAAB: $${me?.faabLeft ?? '--'} left of $${L.faab}. Claims process on the league schedule.` : 'RT Sports waivers run on the league schedule; claim on RT.'));
  main.appendChild(panel);

  const h2 = el('div', 'h'); h2.appendChild(el('h2', null, 'Moves')); h2.appendChild(el('span', 'sub', `${L.transactions.length} this season`)); main.appendChild(h2);
  const p2 = el('section', 'panel');
  if (!L.transactions.length) p2.appendChild(el('div', 'empty', 'No transactions yet'));
  const tl = el('ul', 'rows');
  for (const t of L.transactions.slice(0, 40)) {
    const li = el('li', 'row'); li.style.gridTemplateColumns = '4px 60px minmax(0,1fr) auto';
    li.appendChild(el('span', 'bar'));
    li.appendChild(el('span', 'slot', (t.type || '').replace('free_agent', 'FA').replace('_', ' ').toUpperCase()));
    const who = el('div', 'who'); who.appendChild(el('div', 'nm', t.team));
    const parts = []; if (t.adds?.length) parts.push('Add ' + t.adds.join(', ')); if (t.drops?.length) parts.push('Drop ' + t.drops.join(', '));
    who.appendChild(el('div', 'line', parts.join('  ') || '')); li.appendChild(who);
    const r = el('div', 'pts'); r.appendChild(el('div', 'v', t.bid != null ? '$' + t.bid : '')); r.appendChild(el('div', 'p', t.when instanceof Date ? t.when.toLocaleDateString([], { month: 'short', day: 'numeric' }) : String(t.when || ''))); li.appendChild(r);
    tl.appendChild(li);
  }
  p2.appendChild(tl); main.appendChild(p2);
}
