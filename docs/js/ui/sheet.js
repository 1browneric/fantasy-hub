// Player detail sheet: identity, live line, projection, recent game log,
// and a plain start/sit recommendation with its reason.
import { el, f1, f2, headshot, teamLogo, paintTeam, tag } from '../util.js';
import { statLine } from '../statline.js';
import { scoreSlot, myMatchup, effectiveSlots, elig } from '../model.js';
import { scoreRT, scoreSleeper } from '../scoring.js';
import * as sleeper from '../sources/sleeper.js';
import { gameText } from './rows.js';

export async function openPlayer(S, slot, league) {
  document.querySelectorAll('.modal').forEach(m => m.remove());
  const modal = el('div', 'modal'); modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const sheet = paintTeam(el('div', 'sheet'), S.T, slot.nfl); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', slot.name);
  const mm = myMatchup(league); const r = scoreSlot(league, slot, S.ctx, mm?.m); const g = gameText(r.game);
  const hd = el('div', 'hd');
  hd.appendChild(headshot(S.T, slot.pid, slot.name, slot.nfl, 'lg'));
  const t = el('div'); t.appendChild(el('div', 'n', slot.name));
  const m = el('div', 'm'); m.appendChild(el('span', null, slot.pos)); if (slot.nfl) { m.appendChild(teamLogo(S.T, slot.nfl)); m.appendChild(el('span', null, S.T[slot.nfl]?.name || slot.nfl)); }
  if (slot.inj) m.appendChild(tag('warn', slot.inj)); t.appendChild(m); hd.appendChild(t);
  const x = el('button', 'x', 'Close'); x.onclick = () => modal.remove(); hd.appendChild(x);
  sheet.appendChild(hd);
  const kv = el('div', 'kv');
  const cell = (k, v) => { const d = el('div'); d.appendChild(el('small', null, k)); d.appendChild(el('b', null, v)); return d; };
  kv.appendChild(cell(league.key + ' pts', r.pts == null ? '--' : f2(r.pts)));
  kv.appendChild(cell('proj', f1(r.proj)));
  kv.appendChild(cell(g.tag, g.text.replace(/^(vs|@) \w+ ?/, '') || '--'));
  sheet.appendChild(kv);
  // points in every league that owns him
  const owners = S.leagueList().filter(L => L.byId[L.me]?.slots.some(s => s.pid && s.pid === slot.pid));
  if (owners.length > 1) {
    sheet.appendChild(el('div', 'sec', 'Points by league'));
    for (const L of owners) { const rr = scoreSlot(L, slot, S.ctx, myMatchup(L)?.m); const d = el('div', 'stat'); d.appendChild(el('span', null, L.name)); d.appendChild(el('b', null, (rr.pts == null ? '--' : f2(rr.pts)) + '  proj ' + f1(rr.proj))); sheet.appendChild(d); }
  }
  sheet.appendChild(el('div', 'sec', 'This week'));
  const line = el('div', 'stat'); line.appendChild(el('span', null, statLine(r.stats, slot.pos) || (r.state === 'pre' ? 'Kicks off ' + g.text.replace(/^(vs|@) \w+ /, '') : 'No stats recorded'))); sheet.appendChild(line);
  if (r.game?.lastPlay && r.state === 'in') { const lp = el('div', 'stat'); lp.appendChild(el('span', null, 'Last play: ' + r.game.lastPlay)); sheet.appendChild(lp); }
  // recommendation
  const team = league.teams.find(T => T.slots.some(s => s.pid === slot.pid));
  if (team && team.id === league.me) {
    const slots = effectiveSlots(league, team, S.ctx);
    const rec = el('div', 'rec');
    if (slot.starter) {
      const alt = slots.filter(s => !s.starter && s.pid && elig(slot.slot, s.pos)).map(s => ({ s, pf: scoreSlot(league, s, S.ctx, mm?.m).projFinal })).sort((a, b) => b.pf - a.pf)[0];
      if (alt && alt.pf > r.projFinal + 1) { rec.classList.add('hold'); rec.appendChild(el('b', null, 'Consider a swap')); rec.append(`${alt.s.name} on your bench projects ${f1(alt.pf)} in the ${slot.slot} slot against ${f1(r.projFinal)} for ${slot.name}.`); }
      else { rec.appendChild(el('b', null, 'Start')); rec.append(`${slot.name} projects a final of ${f1(r.projFinal)}` + (alt ? `; best bench option at ${slot.slot} is ${alt.s.name} at ${f1(alt.pf)}.` : '; no eligible bench option.')); }
    } else {
      const cands = slots.filter(s => s.starter && elig(s.slot, slot.pos)).map(s => ({ s, pf: scoreSlot(league, s, S.ctx, mm?.m).projFinal })).sort((a, b) => a.pf - b.pf)[0];
      if (cands && r.projFinal > cands.pf + 1) { rec.appendChild(el('b', null, 'Start him')); rec.append(`${slot.name} projects ${f1(r.projFinal)}; ${cands.s.name} in your ${cands.s.slot} slot projects ${f1(cands.pf)}.`); }
      else { rec.classList.add('hold'); rec.appendChild(el('b', null, 'Bench')); rec.append(`${slot.name} projects ${f1(r.projFinal)}` + (cands ? `; your lowest eligible starter ${cands.s.name} projects ${f1(cands.pf)}.` : '.')); }
    }
    sheet.appendChild(rec);
  }
  // recent game log (last 3 completed weeks; last season before week 2)
  const logHead = el('div', 'sec', 'Recent games'); sheet.appendChild(logHead);
  const logBox = el('div'); logBox.appendChild(el('div', 'stat', 'Loading')); sheet.appendChild(logBox);
  modal.appendChild(sheet); document.body.appendChild(modal); x.focus();
  if (!slot.pid) { logBox.textContent = ''; return; }
  const weeks = [];
  let season = S.state.season, w = S.state.week - 1;
  while (weeks.length < 3) { if (w < 1) { season = String(Number(season) - 1); w = 18; } weeks.push([season, w]); w--; }
  const rows = await Promise.all(weeks.map(async ([se, wk]) => {
    const key = `${se}-${wk}`;
    if (!S.cache.stats[key]) S.cache.stats[key] = sleeper.stats(se, wk).catch(() => ({}));
    const st = (await S.cache.stats[key])?.[slot.pid];
    return { se, wk, st };
  }));
  logBox.textContent = '';
  for (const { se, wk, st } of rows) {
    const d = el('div', 'stat');
    const p = st ? (league.scoring === 'rt' ? scoreRT(st, slot.pos) : scoreSleeper(st, league.boatsScoring)) : null;
    d.appendChild(el('span', null, `${se} wk ${wk}: ` + (st ? (statLine(st, slot.pos) || 'played, no counting stats') : 'did not play')));
    d.appendChild(el('b', null, p == null ? '--' : f1(p)));
    logBox.appendChild(d);
  }
}
