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
  // Suggested bid (FAAB leagues): share of my remaining budget from how much
  // he upgrades my lineup and how hot he is on the wire. Estimate, labelled.
  if (L.faab && me) {
    const maxTrend = Math.max(1, ...cands.map(c => c.trend));
    const topByPos = {}; for (const c of cands) topByPos[c.slot.pos] = Math.max(topByPos[c.slot.pos] || 0, c.proj);
    for (const c of cands) {
      const gain = c.gain != null ? Math.max(0, c.gain) : 0;
      const share = Math.min(0.35, 0.02 + gain * 0.025 + (c.trend / maxTrend) * 0.12 + (c.proj / (topByPos[c.slot.pos] || 1)) * 0.03);
      c.bid = Math.max(1, Math.round(me.faabLeft * share));
    }
  }
  if (L.faab) {
    const fh = el('div', 'h'); fh.appendChild(el('h2', null, 'FAAB')); fh.appendChild(el('span', 'sub', `$${L.faab} budget, claims clear Wednesday`)); main.appendChild(fh);
    const fp = el('section', 'panel faab');
    const top = el('div', 'faab-me');
    const a = el('div'); a.appendChild(el('small', null, 'My FAAB left')); a.appendChild(el('b', null, `$${me?.faabLeft ?? '--'}`)); a.appendChild(el('span', null, ` of $${L.faab}`)); top.appendChild(a);
    const b = el('div'); b.appendChild(el('small', null, 'Waiver position')); b.appendChild(el('b', null, me?.waiverPos ? `${me.waiverPos}` : '--')); b.appendChild(el('span', null, ` of ${L.teams.length}`)); top.appendChild(b);
    const c = el('div'); c.appendChild(el('small', null, 'Spent')); c.appendChild(el('b', null, `$${me ? L.faab - me.faabLeft : '--'}`)); top.appendChild(c);
    fp.appendChild(top);
    const bar = el('div', 'faab-bar'); const fill = el('i'); fill.style.width = me ? Math.round(100 * me.faabLeft / L.faab) + '%' : '0%'; bar.appendChild(fill); fp.appendChild(bar);
    const grid = el('div', 'faab-teams');
    for (const id of [...L.order].sort((x, y) => L.byId[y].faabLeft - L.byId[x].faabLeft)) { const T = L.byId[id]; const row = el('div', String(id) === String(L.me) ? 'me' : null); row.appendChild(el('span', 'tn', T.name + (String(id) === String(L.me) ? ' (me)' : ''))); row.appendChild(el('span', 'amt', `$${T.faabLeft}`)); grid.appendChild(row); }
    fp.appendChild(grid);
    main.appendChild(fp);
  }
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
    const pts = el('div', 'pts'); pts.appendChild(el('div', 'v', f1(c.proj))); pts.appendChild(el('div', 'p', c.bid ? `proj, bid $${c.bid} est.` : 'proj')); li.appendChild(pts);
    li.onclick = () => S.openPlayer(c.slot, L);
    ul.appendChild(li);
  }
  if (!ul.children.length) ul.appendChild(el('li', 'empty', 'No projected free agents at this position'));
  panel.appendChild(ul);
  panel.appendChild(el('div', 'note', L.faab ? `Bids are estimates from lineup upgrade and add volume; place the real claim on Sleeper.` : 'RT Sports waivers run on the league schedule; claim on RT.'));
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
    const r = el('div', 'pts'); r.appendChild(el('div', 'v', t.bid != null ? '$' + t.bid : '')); r.appendChild(el('div', 'p', t.when instanceof Date ? t.when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : String(t.when || ''))); li.appendChild(r);
    tl.appendChild(li);
  }
  p2.appendChild(tl); main.appendChild(p2);
}
