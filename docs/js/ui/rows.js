// Lineup / player rows and the hero matchup block. Shared by several views.
import { el, f1, f2, headshot, teamLogo, paintTeam, tag, fmtKick, pct } from '../util.js';
import { statLine } from '../statline.js';
import { summarize, winProb, myMatchup, scoreSlot, effectiveSlots, elig } from '../model.js';

export function gameText(g) {
  if (!g) return { cls: 'off', tag: 'NO GAME', text: 'Not on the slate' };
  const vs = `${g.isHome ? 'vs' : '@'} ${g.opp}`;
  if (g.state === 'in') return { cls: 'live', tag: 'LIVE', text: `${vs} ${g.detail} ${g.myScore}-${g.oppScore}` + (g.redzone && g.possession === g.team ? ' RED ZONE' : '') };
  if (g.state === 'post') return { cls: 'final', tag: 'FINAL', text: `${vs} ${g.myScore}-${g.oppScore}` };
  return { cls: 'pre', tag: 'PRE', text: `${vs} ${fmtKick(g.kickoff)}` };
}

// One player row. opts: {league, ctx, matchup, onOpen, action, second:{league,ctx,matchup}}
export function playerRow(S, slot, opts) {
  const { league, ctx, matchup } = opts;
  const r = scoreSlot(league, slot, ctx, matchup);
  const g = gameText(r.game);
  const li = paintTeam(el('li', 'row ' + g.cls + (r.state === 'post' ? ' done' : '') + (slot.unmatched ? ' unmatched' : '') + (opts.onOpen ? ' clickable' : '')), S.T, slot.nfl);
  li.appendChild(el('span', 'bar'));
  const sl = el('span', 'slot', slot.slot);
  if (slot.slot !== slot.pos && slot.pos) sl.appendChild(el('small', null, slot.pos));
  li.appendChild(sl);
  li.appendChild(headshot(S.T, slot.pid, slot.name, slot.nfl));
  const who = el('div', 'who');
  const nm = el('div', 'nm', slot.name);
  if (slot.inj) nm.appendChild(el('span', 'inj', slot.inj.slice(0, 4).toUpperCase()));
  who.appendChild(nm);
  const meta = el('div', 'meta');
  meta.appendChild(el('span', 'pos', slot.pos || '--'));
  if (slot.nfl) meta.appendChild(teamLogo(S.T, slot.nfl));
  meta.appendChild(el('span', 'gm' + (r.state === 'in' ? ' live' : ''), g.text));
  who.appendChild(meta);
  const line = slot.unmatched ? 'UNMATCHED: no stat feed for this name' : (statLine(r.stats, slot.pos) || (r.state === 'pre' ? 'No stats yet' : r.state === 'off' ? '' : 'No stats recorded'));
  if (line) who.appendChild(el('div', 'line', line));
  li.appendChild(who);
  if (opts.second) {
    const two = el('div', 'two');
    for (const x of [opts, opts.second]) {
      const rr = scoreSlot(x.league, slot, x.ctx, x.matchup);
      const cell = el('div', 'pts');
      cell.appendChild(el('span', 'lg', x.league.key));
      cell.appendChild(el('div', 'v', rr.pts == null ? '--' : f2(rr.pts)));
      cell.appendChild(el('div', 'p', 'proj ' + f1(rr.proj)));
      two.appendChild(cell);
    }
    li.appendChild(two);
  } else {
    const pts = el('div', 'pts');
    pts.appendChild(el('div', 'v', r.pts == null ? '--' : f2(r.pts)));
    const d = r.pts != null && r.state !== 'pre' ? r.pts - r.proj : null;
    const p = el('div', 'p' + (d == null ? '' : d >= 0 ? ' up' : ' dn'), d == null ? 'proj ' + f1(r.proj) : (d >= 0 ? 'up ' : 'down ') + f1(Math.abs(d)) + ' vs proj');
    pts.appendChild(p);
    li.appendChild(pts);
  }
  if (opts.onOpen) { li.tabIndex = 0; li.setAttribute('role', 'button'); li.onclick = () => opts.onOpen(slot, league); li.onkeydown = e => { if (e.key === 'Enter') opts.onOpen(slot, league); }; }
  if (opts.action) { const a = el('div', 'act'); a.appendChild(opts.action); li.appendChild(a); }
  return li;
}

// The hero: my matchup in one league, with live totals and win probability.
export function hero(S, league, onPick) {
  const box = el('section', 'hero');
  const sel = el('div', 'lgsel');
  for (const k of ['SoFi', 'Y60', 'Boats']) {
    const b = el('button', null, k); b.setAttribute('aria-pressed', String(k === league?.key));
    b.onclick = () => onPick(k); sel.appendChild(b);
  }
  if (league?.platform === 'rtsports' && league.fetchedAt) {
    const age = Math.round((Date.now() - new Date(league.fetchedAt)) / 60000);
    sel.appendChild(tag('est st', `RT ${age} min ago`));
  }
  box.appendChild(sel);
  if (!league) { box.appendChild(el('div', 'empty', 'League not loaded')); return box; }
  const mm = myMatchup(league);
  if (!mm) { box.appendChild(el('div', 'empty', 'No matchup this week')); return box; }
  const A = summarize(league, mm.me, S.ctx, mm.m), B = summarize(league, mm.opp, S.ctx, mm.m);
  // team colours for the glow: the NFL teams of my top projected starter and theirs
  const top = rows => rows.slice().sort((x, y) => y.projFinal - x.projFinal)[0]?.slot.nfl;
  const tp = S.T[top(A.rows)]?.primary, to = S.T[top(B.rows)]?.primary;
  if (tp) box.style.setProperty('--tp', tp); if (to) box.style.setProperty('--to', to);
  const strip = el('div', 'strip');
  for (const r of A.rows) if (r.slot.nfl) strip.appendChild(teamLogo(S.T, r.slot.nfl));
  box.appendChild(strip);
  const face = el('div', 'face');
  const side = (T, sum, right, other) => {
    const d = el('div', 'side' + (right ? ' r' : ''));
    d.appendChild(el('div', 'tn', T.name));
    d.appendChild(el('div', 'rec', `${T.w}-${T.l}${T.t ? '-' + T.t : ''}` + (T.rank ? `  ${ordinal(T.rank)}` : '') + (right ? '' : '  ME')));
    d.appendChild(el('div', 'sc' + (sum.pts < other.pts ? ' trail' : ''), f1(sum.pts)));
    return d;
  };
  face.appendChild(side(mm.me, A, false, B));
  face.appendChild(el('div', 'vs', 'VS'));
  face.appendChild(side(mm.opp, B, true, A));
  box.appendChild(face);
  const proj = el('div', 'proj');
  const pa = el('div'); pa.append('proj final '); pa.appendChild(el('b', null, f1(A.projFinal))); proj.appendChild(pa);
  proj.appendChild(el('div'));
  const pb = el('div', 'r'); pb.append('proj final '); pb.appendChild(el('b', null, f1(B.projFinal))); proj.appendChild(pb);
  box.appendChild(proj);
  const wp = winProb(A, B);
  const w = el('div', 'wp');
  const lab = el('div', 'lab'); lab.appendChild(el('span', null, 'Win probability, est.')); lab.appendChild(el('b', null, pct(wp))); w.appendChild(lab);
  const bar = el('div', 'bar'); const i = el('i'); i.style.width = '0%'; bar.appendChild(i); bar.appendChild(el('i')); w.appendChild(bar);
  requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = pct(wp); }));
  const left = el('div', 'left');
  const la = el('span'); la.appendChild(el('b', null, String(A.yet))); la.append(` of ${A.n} yet to play`);
  const lb = el('span'); lb.appendChild(el('b', null, String(B.yet))); lb.append(` of ${B.n} yet to play`);
  left.appendChild(la); left.appendChild(lb); w.appendChild(left);
  box.appendChild(w);
  return box;
}
export const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');

// Lineup panel with the start/sit what-if.
export function lineupPanel(S, league, team, opts = {}) {
  const mm = myMatchup(league);
  const matchup = mm?.m;
  const panel = el('section', 'panel');
  const ph = el('div', 'ph'); ph.appendChild(el('span', null, opts.title || team.name));
  const sum = summarize(league, team, S.ctx, matchup);
  const r = el('span', 'r'); r.appendChild(el('span', 'num', f1(sum.pts) + ' pts')); r.appendChild(el('span', null, 'proj ' + f1(sum.projFinal)));
  ph.appendChild(r); panel.appendChild(ph);
  const w = S.state.whatIf[league.key];
  if (w && w.team === team.id) {
    const wi = el('div', 'whatif');
    wi.appendChild(el('span', null, `What-if lineup: ${w.inName} in for ${w.outName}. Set the real lineup on ${league.platform === 'sleeper' ? 'Sleeper' : 'RT Sports'}.`));
    const b = el('button', 'btn ghost', 'Reset'); b.onclick = () => { delete S.state.whatIf[league.key]; S.render(); }; wi.appendChild(b);
    panel.appendChild(wi);
  }
  const slots = effectiveSlots(league, team, S.ctx);
  const ul = el('ul', 'rows');
  for (const s of slots.filter(x => x.starter)) ul.appendChild(playerRow(S, s, { league, ctx: S.ctx, matchup, onOpen: S.openPlayer }));
  panel.appendChild(ul);
  const bench = slots.filter(x => !x.starter);
  if (bench.length && opts.bench !== false) {
    const bh = el('div', 'ph'); bh.appendChild(el('span', null, 'Bench')); panel.appendChild(bh);
    const bl = el('ul', 'rows');
    for (const s of bench) {
      let action = null;
      if (opts.whatIf && s.pid && !s.empty) {
        // best slot to take: the eligible starter with the lowest projected final
        const cands = slots.map((x, i) => ({ x, i })).filter(({ x }) => x.starter && elig(x.slot, s.pos));
        const worst = cands.map(c => ({ ...c, pf: scoreSlot(league, c.x, S.ctx, matchup).projFinal })).sort((p, q) => p.pf - q.pf)[0];
        const mine = scoreSlot(league, s, S.ctx, matchup).projFinal;
        if (worst) {
          const b = el('button', 'btn' + (mine > worst.pf ? ' sky' : ' ghost'), `Start over ${worst.x.name.split(' ').pop()}`);
          b.onclick = e => { e.stopPropagation(); S.state.whatIf[league.key] = { team: team.id, slotIdx: team.slots.indexOf(team.slots.find(t => t.pid === worst.x.pid)), inPid: s.pid, inName: s.name, outName: worst.x.name }; S.render(); };
          action = b;
        }
      }
      bl.appendChild(playerRow(S, s, { league, ctx: S.ctx, matchup, onOpen: S.openPlayer, action }));
    }
    panel.appendChild(bl);
  }
  const lg = el('div', 'legend');
  lg.append(legendItem('o', 'Live now'), legendItem('b', 'Ahead / up vs projection'), legendItem('g', 'Final'));
  panel.appendChild(lg);
  return panel;
}
export function legendItem(c, t) { const s = el('span'); s.appendChild(el('i', c)); s.append(t); return s; }
