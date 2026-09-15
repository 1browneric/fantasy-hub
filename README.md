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
- **NFL** sits second, beside Home (Eric, 2026-09-15).
- **Matchup** - my lineup and bench with the start/sit what-if; opponent's lineup scored live.
- **My Players** - every player I own across the leagues, both point totals where two leagues own him.
- **Rosters**, **Standings**, **Waivers** (pickups by projected points under each league's scoring, trending adds, every move), **NFL** (all games, clock, possession, red zone, down and distance, the snap that just happened - labelled TOUCHDOWN / FIELD GOAL GOOD / SAFETY when it scored - then how the points went on the board: every scoring play in game order with the drive line and the score after it, the last five on the card and all of them by quarter in the game sheet - and my players in each). Tapping a game opens the game sheet in three tabs: **Summary** (last play, scoring plays, my players in it), **Team stats** (ESPN's 25 rows side by side) and **Players** (game leaders, then every player on the chosen team by group - passing, rushing, receiving, fumbles, defense, interceptions, returns, kicking, punting - with ESPN's columns and a team totals row; a player I own is marked with the league). The sheet redraws with every refresh while it is open.

## Data (all public, no keys, no login)
- **Sleeper** - live from the phone: NFL state, weekly stats, Boats league (users, rosters, matchups, transactions), trending adds. Primary for stats and points.
- **ESPN scoreboard** - live from the phone: every game, clock, score, possession. Primary for game state. ESPN's default view keeps the finished week until Wednesday, so the NFL tab and My games flip a day after the leagues do; Eric is fine with that (2026-09-15). Team colours and logos from ESPN's team feed at build time.
- **ESPN game summary** (`summary?event=<id>`) - live from the phone, one call per game: the scoring plays, the drives, the box score and the leaders. It is a large document, so it is read only when the scoreboard shows a score that game has not shown before (once for a final, and on each score while live), plus every refresh for the one live game whose sheet is open so its box score keeps up; a failed read keeps the last one. `parseScoring` and `parseBox` in `docs/js/sources/espn.js`, tested by `node --test tests/*.test.mjs`.
- **RT Sports guest pages** - no CORS, so `build/rt-fetch.mjs` runs in GitHub Actions (`.github/workflows/rt.yml`) and commits `docs/data/rt/{SoFi,Y60}.json`. GitHub's scheduler does not keep time (7 of 24 hourly runs delivered in a week of September 2026), so the workflow does not rely on it firing often: a run that lands during an NFL game, or within 90 minutes of a kickoff, stays alive and refreshes every 6 minutes until the window's last game is final (`build/rt-loop.sh`). Windows are read from ESPN's schedule (`build/game-window.mjs`), so odd days need no calendar. Off-window it refreshes about hourly.: matchups with scores, standings, every roster, transactions.
  - **The week's matchups come from the gamecast provider, not the home card.** The league home's Weekly Matchups card keeps the finished week's finals up until the new week's first kickoff (Tuesday 2026-09-15: header "Week 2", every card a week-1 Final), so a hub built from it showed last week's opponent all Tuesday-to-Thursday. `/football/gamecast-provider.php?LID&UID&FWK&TM1&TM2` - the JSON the gamecast page polls - answers a guest for any two team ids with `fantasyGames`, every matchup of week FWK with live scores; `rt-fetch.mjs` asks for the header's week and uses that. Each matchup carries `fwk`, the week it belongs to; the file carries `matchupsWeek` and `matchupsSource`. The new week is picked up by the next pass after RT flips the header, no Tuesday cron needed.
  - **The Tuesday rollover can leave a league with no week list anywhere.** Later that morning (12:35 UTC on) Road to SoFi's home card had no rows and the provider's `fantasyGames` was empty for every pair and both weeks, while Year of the 60 answered fine. Fallbacks, in order (`pickMatchups`): the provider list; the home card's rows for the header week; **my matchup alone** - `team-capsules.php?TID=<mine>` (guest) links the week's gamecast with my pair, and the provider's `matchup` block scores that pair even while its list is empty; the last run's matchups when they were this week's; and only then last week's rows, labelled with their week. A run never writes a blank week and never labels week N-1 as week N. My team is detected by roster overlap with `docs/data/my-players.json`. RT opponents' scores and standings lag 5-10 minutes; my own RT points are computed live from Sleeper stats under RT scoring.
- **Projections** - `build/build-proj.mjs` (same cron) pre-scores Sleeper's weekly projections under both scoring systems into `docs/data/proj.json`.
- `docs/data/index.json` - compact id -> [name, pos, team, injury, espn id, number] for every active fantasy player (built from Sleeper's 14.6 MB file, never shipped to the phone).

## Scoring
`docs/js/scoring.js`. SoFi/Y60 hard-coded from the RT rules page; Boats applies Sleeper's own `scoring_settings` (live, baked fallback in `docs/data/leagues.json`).

## Name matching
`docs/js/model.js` `matchPlayer`: name+team+pos, then name+pos, then name, then collapsed name (DJ vs D.J.), then last name+team+pos (Kenny vs Kenneth). A tier only counts when it names exactly one player. Anything unmatched renders loudly on its row and in a banner; never blank, never dropped.

## Live math
Projected final per starter = points so far + projection x share of game remaining. Win probability is a logistic on the projected-final gap, widened by how much football is left; labelled "est." everywhere.

## Tests
```bash
source ~/.nvm/nvm.sh
node --test tests/*.test.mjs
```

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
No emojis or icons; team logos and headshots are brand imagery, and possession
is a drawn football (`football()` in `docs/js/util.js`) - a shape, not an icon
font and not an emoji. RED ZONE stays in words beside it, because that one has
to be read rather than inferred. Blue vs orange only for meaning, always with text or shape. Never sorted or annotated by bye week. Auto-refresh 30 s while games are live, 5 min otherwise, and on return to the app. Light panels on a field-green chrome; team colours enter as data.

## Debug
`?season=2025&week=1&date=20250907` replays a completed slate (Boats uses its 2025 league). `&simulate=live` forces every game in progress. Both show a REPLAY banner.
