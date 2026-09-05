# fantasy-hub — MY PLAYERS

One live list of every player Eric owns across his three fantasy football
leagues. That is the whole app; there are no other tabs.

**Live:** https://1browneric.github.io/fantasy-hub/

## Leagues

| Key | League | Platform | Format |
|---|---|---|---|
| SoFi | Road to SoFi | RT Sports (LID 389290) | 12-team $200 auction, full PPR |
| Y60 | Year of the 60 | RT Sports (LID 389292) | rules-identical to SoFi |
| Boats | Boats And Bros | Sleeper (1389390879541727232) | 8-team superflex |

45 unique players across 49 roster slots. Four are owned in two leagues
(Ashton Jeanty, Quinshon Judkins, Mark Andrews, Drake London) and their card
shows **both** point totals, because the scoring differs.

## GitHub Pages

Served from **branch `main`, folder `/docs`**. Everything the phone loads is in
`docs/`. No build server; `docs/data/*.json` is committed.

## Data sources

Both are public, key-less, and send `Access-Control-Allow-Origin: *`, so the
phone calls them directly.

- **ESPN scoreboard** — `site.api.espn.com/.../nfl/scoreboard`
  Game state: opponent, kickoff, quarter + clock, score.
- **Sleeper** — `api.sleeper.app/v1`
  `state/nfl` (current week), `stats/nfl/regular/{season}/{week}` (stat lines),
  `league/{id}` (Boats scoring settings).

### Why Sleeper is primary for stats

ESPN's `summary?event={id}` boxscore *does* work (verified 2026-09-05 against
2025 event 401772830, TB at ATL: `boxscore.players` has both teams with passing,
rushing, receiving, fumbles, defensive, kicking categories, and its Mayfield line
17/32, 167 yd, 3 TD matches Sleeper's for the same game). But it returns
per-category **display strings** (`"17/32"`, `"1-8"`), has no 2-point or
team-defense line, and needs one request per game (up to 16 per refresh).
Sleeper returns **normalized numeric keys** (`rec`, `rec_yd`, `fum_lost`,
`pass_2pt`, `fgm_yds_over_30`, `pts_allow`) for every player in one request,
mapping 1:1 onto both leagues' scoring formulas.

So: **Sleeper is primary for stats and fantasy points; ESPN is primary for game
state.** ESPN's boxscore is not used at runtime.

Two known-empty responses that are **expected, not bugs**:
- ESPN `summary.boxscore.players` is `[]` before a game kicks off.
- Sleeper `stats/.../2026/1` returns `{}` until Week 1 kicks off (Sep 9).
  The UI shows "No stats yet", never an error.

## Name matching

The roster carries names only; both feeds use their own ids. `build/build-players.mjs`
normalizes (lowercase, strip accents/punctuation, drop Jr/Sr/II/III) and matches
on **name + NFL team + position**, falling back to looser tiers and finally to a
space-collapsed key — that last tier is what links the roster's "Devon Achane"
to Sleeper's "De'Von Achane". Team defenses are keyed by team abbreviation.

**Current result: 45/45 matched** (44 on the strictest name+team+pos tier, 1 via
collapsed-name). Any player that ever fails to match is flagged `unmatched` and
renders **loudly on his own card** plus a header banner — never silently blank
and never dropped.

## Scoring

`docs/js/scoring.js`.

- **SoFi / Y60** — hard-coded from the RT rules page: 4 pt pass TD, 0.05/pass yd,
  -1 INT, 6 pt rush/rec TD, 0.10/yd, 1.0/reception, -1 fumble lost, 2 pt 2XP;
  K 3/FG + 0.10 per yard over 30 + 1/PAT; DST 1 sack, 2 INT, 2 fum rec, 2 safety,
  6 TD, points-allowed bonus 5/3/1 for 0 / 1-9 / 10-13.
- **Boats** — read from Sleeper's **own** `scoring_settings` and applied as a dot
  product of settings x stats. Deliberately *not* the RT numbers: Boats pays 6 pt
  pass TDs, 0.04/pass yd, -2 fumbles, tiered FGs and different points-allowed
  bands. Fetched live each refresh with the build-time copy in
  `docs/data/leagues.json` as the offline fallback.

## Build

```bash
source ~/.nvm/nvm.sh
node build/build-players.mjs   # 12,226 Sleeper players (14.6 MB) -> docs/data/players.json (7 KB)
node build/build-leagues.mjs   # Boats scoring_settings -> docs/data/leagues.json
```
The 14.6 MB Sleeper player file is **build-time only** and never sent to the phone.

## Behaviour

- Auto-refreshes every **30 s while any game is live**, every 5 min otherwise, and
  immediately when the app returns to the foreground. No pull-to-refresh.
- Sorted live games first, then upcoming by kickoff, then finals. **Never** sorted,
  grouped or annotated by bye week.
- Filter by league (All / SoFi / Y60 / Boats) and a "Playing now" toggle.
- Colourblind-safe: blue + orange only, never a red-green scale, and every colour
  is paired with a text tag (LIVE / PRE / FINAL / UNMATCHED).
- No emoji and no icons anywhere in the UI.
- PWA: `manifest.json`, service worker, apple-touch-icon, `display: standalone`.
  The service worker caches the app shell only — live feeds always hit the network.

## Debug parameters

Not active unless explicitly passed; all of them show a REPLAY banner.

- `?season=2025&week=1&date=20250907` — replay a real completed slate through the
  production code path (the only way to see real stat lines before Sep 9 2026).
- `?simulate=live` — force every game in-progress to verify the live layout.
