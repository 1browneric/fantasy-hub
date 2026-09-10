#!/usr/bin/env bash
# One run of the RT workflow.
#   Off-window: refresh once if the data is older than STALE_MIN, then exit.
#   In a window: stay alive and refresh every INTERVAL seconds until the last
#   game of the window is final, take one final capture, then exit.
# GitHub's scheduler only has to land ONE run per window for the whole window
# to stay fresh - it no longer has to fire every 5 minutes, which it does not.
set -u
INTERVAL=${INTERVAL:-360}      # 6 min: 10 commits an hour, the Pages build ceiling
BUDGET=${BUDGET_MIN:-340}      # the job is killed at 355; hand off before that
MAX_LOOPS=${MAX_LOOPS:-1000}
STALE_MIN=${STALE_MIN:-55}
start=$(date +%s)

# Every pass starts from the newest main. A run that waited in the queue behind
# a game-day loop was checked out at the commit it was queued on - possibly
# hours old - so without this it misreads how fresh the data is and writes on
# top of data files the loop has since replaced, which cannot rebase cleanly.
# Safe on a runner: nothing local is ever worth keeping between passes.
sync() { git fetch -q origin main && git reset -q --hard origin/main; }

commit() {
  git add docs/data/rt/*.json docs/data/proj.json
  if git diff --cached --quiet; then echo "  no change"; return 0; fi
  git commit -q -m "rt: guest data $(date -u +%Y-%m-%dT%H:%MZ)"
  for t in 1 2 3; do
    if git pull -q --rebase origin main && git push -q; then echo "  pushed"; return 0; fi
    sleep 5
  done
  echo "  push failed after 3 tries"; return 1
}
rt()   { node build/rt-fetch.mjs  || echo "  rt-fetch refused this pass; last good data kept"; }
proj() { node build/build-proj.mjs || echo "  build-proj failed this pass"; }
age_min() { node -e "const d=require('./docs/data/rt/SoFi.json');console.log(Math.round((Date.now()-new Date(d.fetchedAt))/60000))" 2>/dev/null || echo 9999; }

sync
w=$(node build/game-window.mjs)
echo "window at start: $w"
if [ "$w" = "off" ] || [ "$w" = "unknown" ]; then
  a=$(age_min)
  if [ "$a" -ge "$STALE_MIN" ]; then echo "off-window, data ${a} min old: one refresh"; rt; proj; commit
  else echo "off-window, data ${a} min old: nothing to do"; fi
  exit 0
fi

n=0; was_live=0
while :; do
  n=$((n+1))
  [ "$n" -gt 1 ] && sync
  case "$w" in
    live|unknown)
      if [ "$w" = "unknown" ] && [ "$was_live" -eq 0 ]; then echo "pass $n: schedule unreadable, nothing live yet: stop"; break; fi
      echo "pass $n: live, refreshing"; rt
      if [ $((n % 5)) -eq 1 ]; then proj; fi
      commit; was_live=1 ;;
    soon)
      if [ "$was_live" -eq 1 ]; then echo "pass $n: games final for now, capturing"; rt; proj; commit; was_live=0
      elif [ $((n % 5)) -eq 1 ]; then echo "pass $n: kickoff soon, projections"; proj; commit
      else echo "pass $n: kickoff soon, waiting"; fi ;;
    off)
      if [ "$was_live" -eq 1 ]; then echo "pass $n: window closed, final capture"; rt; proj; commit; fi
      break ;;
  esac
  elapsed=$(( ($(date +%s) - start) / 60 ))
  if [ "$n" -ge "$MAX_LOOPS" ] || [ "$elapsed" -ge "$BUDGET" ]; then echo "handing off after $n passes, $elapsed min"; break; fi
  sleep "$INTERVAL"
  w=$(node build/game-window.mjs)
done
