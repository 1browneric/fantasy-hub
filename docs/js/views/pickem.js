// Pick'em: the Big Als confidence pool. Every week on a chip row; for the
// week picked, where I sit, the games in confidence order with my pick in
// each (tap one for why), and the top of the table. Open games can be
// reordered and sent to ESPN: the Hub cannot hold the ESPN cookie, so Send
// mails the order to Eric's own +pickem alias and the VM enters it
// (agents/pickem/inbox.py in home-base).
import { el, teamLogo, tag, fmtKick, fmtTime, pct } from '../util.js';
import { ordinal } from '../ui/rows.js';
import { openPick } from '../ui/pksheet.js';
import { ENTRY_ID, load } from '../sources/pickem.js';

const FADE = 0.10; // the email's POOL FADES THIS line: market beats the pool by 10 points
const DONE = new Set(['CORRECT', 'INCORRECT']);
const STALE_MS = 5 * 60_000;
const SEND_TO = '1brown.eric+pickem@gmail.com';

// localStorage never throws the view away: private mode, blocked storage.
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* keep going */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* keep going */ } },
};
const KEY = (wk, what) => `pk-${what}-w${wk}`;

// The week on screen: ESPN's current week comes with every refresh; any other
// week is fetched when its chip is tapped and kept.
function weekData(S) {
  const cur = S.pickem; if (!cur) return null;
  const wk = S.state.pkWeek || cur.period;
  if (wk === cur.period) return cur;
  S.pickemWeeks ||= {};
  const have = S.pickemWeeks[wk];
  if (!have || Date.now() - have.fetched > STALE_MS) {
    if (!S.pickemLoading?.[wk]) {
      (S.pickemLoading ||= {})[wk] = true;
      load(wk).then(p => { S.pickemWeeks[wk] = p; }).catch(e => console.warn("Pick'em week " + wk, e))
        .finally(() => { S.pickemLoading[wk] = false; if (S.state.tab === 'pickem') S.render(); });
    }
  }
  return have || null;
}

// Points his locked picks have not used, highest first: an open game takes
// these in order, so no two games can ever show the same number.
function freeValues(P) {
  const used = new Set(P.rows.filter(r => r.picked).map(r => r.conf));
  return P.rows.map((_, i) => P.rows.length - i).filter(v => !used.has(v));
}
const openGames = P => P.rows.filter(r => !r.picked && !r.locked);
// An order still fits when it names exactly this week's open games and teams.
function fits(order, P) {
  const open = openGames(P);
  return Array.isArray(order) && order.length === open.length
    && order.every(o => open.some(r => r.id === o.prop && r.outs.some(x => x.id === o.out)));
}
// The order being edited: his saved edits while they fit, else the ladder.
function workingOrder(P) {
  const saved = store.get(KEY(P.period, 'order'));
  if (fits(saved, P)) return saved;
  return [...openGames(P)].sort((a, b) => (b.fav?.p ?? 0) - (a.fav?.p ?? 0))
    .map(r => ({ prop: r.id, out: (r.fav || r.outs[0]).id }));
}

export function render(S, main) {
  if (!S.pickem) { main.appendChild(el('div', 'empty', S.pickemErr ? "Pick'em did not load" : "Pulling pick'em")); return; }
  if (S.pickemErr) { const b = el('div', 'banner'); b.appendChild(el('span', 'tag', 'STALE')); b.appendChild(el('span', null, `Pick'em as of ${fmtTime(S.pickem.fetched)}`)); main.appendChild(b); }

  const wk = S.state.pkWeek || S.pickem.period;
  const chips = el('div', 'chips');
  let sel = null;
  for (const w of S.pickem.weeks) {
    const b = el('button', 'chip', w.abbrev.replace(/^Wk/, 'Wk '));
    b.setAttribute('aria-pressed', String(w.id === wk)); if (w.id === wk) sel = b;
    b.onclick = () => { S.state.pkWeek = w.id; S.render(); };
    chips.appendChild(b);
  }
  main.appendChild(chips);
  requestAnimationFrame(() => { if (sel) chips.scrollLeft = sel.offsetLeft - (chips.clientWidth - sel.offsetWidth) / 2; });

  const P = weekData(S);
  if (!P) { main.appendChild(el('div', 'empty', `Pulling week ${wk}`)); return; }
  const editing = S.pkEditWeek === P.period;
  const sent = store.get(KEY(P.period, 'sent'));
  const sentFits = sent && fits(sent.order, P);
  const order = editing ? workingOrder(P) : sentFits ? sent.order : null;
  const rows = pickRows(S, P, order);
  for (const n of standingBlock(S, P, rows)) main.appendChild(n);

  const right = rows.filter(x => x.result === 'CORRECT').length, wrong = rows.filter(x => x.result === 'INCORRECT').length;
  const subTxt = editing ? 'not sent yet'
    : `${right} correct, ${wrong} wrong, ${rows.filter(x => !x.result).length} to play` + (sentFits ? `, sent ${fmtTime(new Date(sent.at)).replace(/:\d\d (?=[AP]M)/, ' ')}` : '');
  const h2 = el('div', 'h'); h2.appendChild(el('h2', null, editing ? 'Change order' : 'My picks')); h2.appendChild(el('span', 'sub', subTxt)); main.appendChild(h2);

  if (openGames(P).length) {
    const bar = el('div', 'chips pk-bar');
    const chip = (label, cls, fn) => { const b = el('button', 'chip' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = fn; bar.appendChild(b); return b; };
    if (!editing) chip('Change order', null, () => { S.pkEditWeek = P.period; S.render(); });
    else {
      // A real mailto link, not a script redirect: a tap on a link is what
      // reliably opens Mail from a Home Screen app, and every edit re-renders,
      // so the href always carries the order on screen.
      const a = el('a', 'chip hot', 'Send to ESPN'); a.href = mailto(P); a.setAttribute('aria-pressed', 'true');
      a.onclick = () => { store.set(KEY(P.period, 'sent'), { at: Date.now(), order: workingOrder(P) }); setTimeout(() => { S.pkEditWeek = null; S.render(); }, 400); };
      bar.appendChild(a);
      chip('Reset', null, () => { store.del(KEY(P.period, 'order')); S.render(); });
      chip('Done', null, () => { S.pkEditWeek = null; S.render(); });
    }
    main.appendChild(bar);
  }

  const list = el('section', 'panel pk-list');
  for (const x of rows) list.appendChild(editing ? editRow(S, P, x) : row(S, x));
  if (!rows.length) list.appendChild(el('div', 'empty', 'No games posted for this week yet'));
  main.appendChild(list);
  if (editing) return;

  const ranked = [...P.entries].sort((a, b) => (a.score?.rank ?? 1e9) - (b.score?.rank ?? 1e9));
  const show = ranked.slice(0, 10); if (P.me && !show.includes(P.me)) show.push(P.me);
  const h3 = el('div', 'h'); h3.appendChild(el('h2', null, 'Big Als')); h3.appendChild(el('span', 'sub', `top 10 of ${P.size}`)); main.appendChild(h3);
  const panel = el('section', 'panel'); const scr = el('div', 'scroll');
  const t = el('table', 'tbl'); const tr = el('tr');
  for (const [c, cls] of [['', null], ['Entry', null], ['Wk', 'n'], ['Total', 'n']]) tr.appendChild(el('th', cls, c));
  const th = el('thead'); th.appendChild(tr); t.appendChild(th);
  const tb = el('tbody');
  for (const e of show) {
    const mine = e.id === ENTRY_ID; const r = el('tr', mine ? 'me' : null);
    r.appendChild(el('td', 'rk', e.score?.rank ? String(e.score.rank) : '-'));
    const n = el('td'); n.appendChild(el('b', null, e.name + (mine ? '  ME' : ''))); n.appendChild(el('small', 'pk-mem', e.member?.displayName || '')); r.appendChild(n);
    r.appendChild(el('td', 'n', String(e.score?.scoreByPeriod?.[P.period]?.score ?? 0)));
    r.appendChild(el('td', 'n', String(e.score?.overallScore ?? 0)));
    tb.appendChild(r);
  }
  t.appendChild(tb); scr.appendChild(t); panel.appendChild(scr); main.appendChild(panel);
}

// A week's games in confidence order: his pick once a game locks; before that
// the order he is editing or last sent, else the ladder's.
export function pickRows(S, P = S.pickem, order = null) {
  if (!P) return [];
  const games = new Map(S.ctx.games.list.map(g => [String(g.id), g]));
  const free = freeValues(P);
  const pos = order ? new Map(order.map((o, i) => [o.prop, { i, out: o.out }])) : null;
  return P.rows.map(r => {
    let pick = null, conf = null;
    if (r.picked) { pick = r.picked; conf = r.conf; }
    else if (!r.locked && pos?.has(r.id)) { const o = pos.get(r.id); pick = r.outs.find(x => x.id === o.out) || r.fav; conf = free[o.i] ?? null; }
    else if (!r.locked) { pick = r.fav; conf = r.ladderConf; }
    const g = games.get(r.event);
    return { r, g, pick, opp: pick ? r.outs.find(o => o !== pick) : null, conf, result: result(r, g, pick) };
  }).sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));
}

// The header and the four-number standing. Shared with Home, where a tap on
// the numbers opens this tab.
export function standingBlock(S, P = S.pickem, rows = pickRows(S, P), onTap = null) {
  const sc = P.me?.score || {};
  const wk = sc.scoreByPeriod?.[P.period] || {};
  const inPlay = rows.filter(x => x.pick && !x.result).reduce((s, x) => s + (x.conf || 0), 0);
  const h = el('div', 'h'); h.appendChild(el('h2', null, "Pick'em")); h.appendChild(el('span', 'sub', `${P.label}, ${P.size} entries`));
  const st = el(onTap ? 'button' : 'section', 'panel pk-stand');
  if (onTap) { st.type = 'button'; st.onclick = onTap; st.setAttribute('aria-label', "Pick'em standing, open Pick'em"); }
  const cell = (big, small) => { const c = el('div'); c.appendChild(el('b', 'num', big)); c.appendChild(el('span', null, small)); st.appendChild(c); };
  cell(sc.rank ? ordinal(sc.rank) : '-', `of ${P.size}`);
  cell(String(wk.score ?? 0), 'week pts');
  cell(String(inPlay), 'in play');
  cell(String(sc.overallScore ?? 0), 'season pts');
  return [h, st];
}

// The order as a mail to his own +pickem alias; the VM enters it on ESPN and
// emails the confirmation. One line per open game: points TEAM propositionId
// outcomeId - the exact shape agents/pickem/inbox.py parses.
function mailto(P) {
  const order = workingOrder(P), free = freeValues(P);
  const lines = [`PICKEM v1 week ${P.period}`];
  order.forEach((o, i) => {
    const r = P.rows.find(x => x.id === o.prop); const out = r?.outs.find(x => x.id === o.out);
    if (r && out) lines.push(`${free[i]} ${out.abbrev} ${r.id} ${out.id}`);
  });
  return `mailto:${SEND_TO}?subject=${encodeURIComponent(`Pick'em week ${P.period}`)}&body=${encodeURIComponent(lines.join('\n') + '\n')}`;
}

// ESPN's own verdict when it has posted one; the final score when it lags.
function result(r, g, pick) {
  if (DONE.has(r.result)) return r.result;
  if (!pick || g?.state !== 'post') return null;
  const [ps, os] = score(g, pick);
  return ps > os ? 'CORRECT' : ps < os ? 'INCORRECT' : null;
}
function score(g, pick) {
  const home = pick.abbrev === g.home;
  return home ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
}

function teamBlock(S, r, g, pick, opp) {
  const t = el('div', 'pk-t');
  const ab = el('span', 'ab');
  if (pick) { ab.appendChild(teamLogo(S.T, pick.abbrev)); ab.append(pick.abbrev); } else ab.append(r.name);
  t.appendChild(ab);
  const vs = pick && opp ? (pick.home ? 'vs ' : '@ ') + opp.abbrev : '';
  let when = fmtKick(r.kickoff);
  if (g && pick && g.state === 'in') { const [ps, os] = score(g, pick); when = `${g.detail}  ${ps}-${os}`; }
  else if (g && pick && g.state === 'post') { const [ps, os] = score(g, pick); when = `Final  ${ps}-${os}`; }
  t.appendChild(el('small', null, [vs, when].filter(Boolean).join(', ')));
  return t;
}

function row(S, x) {
  const { r, g, pick, opp, conf, result } = x;
  const live = g?.state === 'in';
  const d = el('button', 'pk-row' + (live ? ' live' : '') + (result === 'INCORRECT' ? ' miss' : ''));
  d.type = 'button'; d.onclick = () => openPick(S, x); d.setAttribute('aria-label', `${r.name}, why this pick`);
  d.appendChild(el('span', 'pk-c', conf != null ? String(conf) : '-'));
  d.appendChild(teamBlock(S, r, g, pick, opp));
  const rc = el('div', 'pk-r');
  if (result === 'CORRECT') rc.appendChild(tag('me', 'CORRECT'));
  else if (result === 'INCORRECT') rc.appendChild(tag('them', 'WRONG'));
  else if (!pick) rc.appendChild(tag('warn', 'NO PICK'));
  else if (live) { const [ps, os] = score(g, pick); rc.appendChild(ps > os ? tag('pre', 'LEADING') : ps < os ? tag('warn', 'TRAILING') : tag('final', 'TIED')); }
  const odds = [pick?.p != null ? `win ${pct(pick.p)}` : '', pick?.pool != null ? `pool ${pct(pick.pool)}` : ''].filter(Boolean).join('  ');
  if (odds) rc.appendChild(el('span', null, odds));
  if (!r.locked && pick?.p != null && pick.pool != null && pick.p - pick.pool > FADE) rc.appendChild(tag('pre', 'POOL FADES THIS'));
  d.appendChild(rc);
  return d;
}

// Editing: an open game moves up or down, and a tap on the team switches the
// pick to the other side. Locked games hold their place and their points.
function editRow(S, P, x) {
  const { r, g, pick, opp, conf } = x;
  const open = !r.picked && !r.locked;
  const d = el('div', 'pk-row edit' + (open ? '' : ' lock'));
  d.appendChild(el('span', 'pk-c', conf != null ? String(conf) : '-'));
  if (open) {
    const flip = el('button', 'pk-flip'); flip.type = 'button'; flip.setAttribute('aria-label', `Switch the ${r.name} pick`);
    flip.appendChild(teamBlock(S, r, g, pick, opp));
    flip.onclick = () => edit(S, P, ord => { const o = ord.find(y => y.prop === r.id); const other = r.outs.find(y => y.id !== o.out); if (other) o.out = other.id; });
    d.appendChild(flip);
  } else d.appendChild(teamBlock(S, r, g, pick, opp));
  const rc = el('div', 'pk-r pk-mv');
  if (open) {
    const ord = workingOrder(P); const i = ord.findIndex(y => y.prop === r.id);
    const mv = (label, dir) => {
      const b = el('button', null, label); b.type = 'button';
      if (i + dir < 0 || i + dir >= ord.length) b.disabled = true;
      b.onclick = () => edit(S, P, o => { const j = i + dir; [o[i], o[j]] = [o[j], o[i]]; });
      rc.appendChild(b);
    };
    mv('Up', -1); mv('Down', 1);
  } else rc.appendChild(tag('final', 'LOCKED'));
  d.appendChild(rc);
  return d;
}
function edit(S, P, fn) {
  const ord = workingOrder(P).map(o => ({ ...o }));
  fn(ord);
  store.set(KEY(P.period, 'order'), ord);
  S.render();
}
