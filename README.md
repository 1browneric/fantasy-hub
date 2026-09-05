# Fantasy Hub

All three of Eric's fantasy football leagues in one installable app, live on
game day. **Live:** https://1browneric.github.io/fantasy-hub/

| Key | League | Platform | Format |
|---|---|---|---|
| SoFi | Road to SoFi | RT Sports (LID 389290) | 12-team $200 auction, full PPR |
| Y60 | Year of the 60 | RT Sports (LID 389292) | rules-identical to SoFi |
| Boats | Boats And Bros | Sleeper (1389390879541727232) | 8-team superflex |

## Tabs
- **Home** - hero matchup (switch league), one card per league, my NFL games, presented-by insight, standings strip.
- **Matchup** - my lineup and bench with the start/sit what-if; opponent's lineup scored live.
- **My Players** - every player I own across the leagues, both point totals where two leagues own him.
- **Rosters**, **Standings**, **Waivers** (pickups by projected points under each league's scoring, trending adds, every move), **NFL** (all games, clock, possession, red zone, my players in each).

## Data (all public, no keys, no login)
- **Sleeper** - live from the phone: NFL state, weekly stats, Boats league (users, rosters, matchups, transactions), trending adds. Primary for stats and points.
- **ESPN scoreboard** - live from the phone: every game, clock, score, possession. Primary for game state. Team colours and logos from ESPN's team feed at build time.
- **RT Sports guest pages** - no CORS, so `build/rt-fetch.mjs` runs on a GitHub Actions cron (`.github/workflows/rt.yml`, every 5 min in game windows, hourly otherwise) and commits `docs/data/rt/{SoFi,Y60}.json`: matchups with scores, standings, every roster, transactions. My team is detected by roster overlap with `docs/data/my-players.json`. RT opponents' scores and standings lag 5-10 minutes; my own RT points are computed live from Sleeper stats under RT scoring.
- **Projections** - `build/build-proj.mjs` (same cron) pre-scores Sleeper's weekly projections under both scoring systems into `docs/data/proj.json`.
- `docs/data/index.json` - compact id -> [name, pos, team, injury, espn id, number] for every active fantasy player (built from Sleeper's 14.6 MB file, never shipped to the phone).

## Scoring
`docs/js/scoring.js`. SoFi/Y60 hard-coded from the RT rules page; Boats applies Sleeper's own `scoring_settings` (live, baked fallback in `docs/data/leagues.json`).

## Name matching
`docs/js/model.js` `matchPlayer`: name+team+pos, then name+pos, then name, then collapsed name (DJ vs D.J.), then last name+team+pos (Kenny vs Kenneth). A tier only counts when it names exactly one player. Anything unmatched renders loudly on its row and in a banner; never blank, never dropped.

## Live math
Projected final per starter = points so far + projection x share of game remaining. Win probability is a logistic on the projected-final gap, widened by how much football is left; labelled "est." everywhere.

## Build
```bash
source ~/.nvm/nvm.sh
node build/build-teams.mjs    # ESPN team colours + logos -> docs/data/teams.json
node build/build-index.mjs    # Sleeper universe -> docs/data/index.json
node build/build-leagues.mjs  # Boats scoring_settings -> docs/data/leagues.json
node build/build-proj.mjs     # projections -> docs/data/proj.json   (cron)
node build/rt-fetch.mjs       # RT guest pages -> docs/data/rt/*.json (cron)
```
`build/build-players.mjs` and `docs/data/players.json` are the retired single-list build; the app no longer reads them.

## Rules baked in
No emojis or icons; team logos and headshots are brand imagery. Blue vs orange only for meaning, always with text or shape. Never sorted or annotated by bye week. Auto-refresh 30 s while games are live, 5 min otherwise, and on return to the app. Light panels on a field-green chrome; team colours enter as data.

## Debug
`?season=2025&week=1&date=20250907` replays a completed slate (Boats uses its 2025 league). `&simulate=live` forces every game in progress. Both show a REPLAY banner.
