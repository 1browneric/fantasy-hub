// Is an NFL game on? Reads ESPN's own schedule, so every window counts -
// Wednesday openers, London mornings, December Saturdays, Thanksgiving,
// Christmas - without a hand-kept calendar. Prints one word:
//   live     a game is in progress
//   soon     nothing live, but a game kicks off within LEAD_MIN minutes
//   off      neither
//   unknown  the schedule could not be read
// FORCE_WINDOW=live|soon|off overrides it, for testing the loop.
const LEAD = Number(process.env.LEAD_MIN || 90);
if (process.env.FORCE_WINDOW) { console.log(process.env.FORCE_WINDOW); process.exit(0); }
let d;
try {
  const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  d = await r.json();
} catch (e) { console.error('schedule unreadable: ' + e.message); console.log('unknown'); process.exit(0); }
const now = Date.now();
let live = 0, next = Infinity;
for (const ev of d.events || []) {
  const st = ev.competitions?.[0]?.status?.type?.state || ev.status?.type?.state;
  if (st === 'in') live++;
  else if (st === 'pre') next = Math.min(next, new Date(ev.date).getTime() - now);
}
const mins = next / 60000;
if (live) { console.error(`${live} game(s) live`); console.log('live'); }
else if (mins <= LEAD) { console.error(`next kickoff in ${Math.round(mins)} min`); console.log('soon'); }
else { console.error(Number.isFinite(mins) ? `next kickoff in ${(mins / 60).toFixed(1)} h` : 'nothing left on the slate'); console.log('off'); }
