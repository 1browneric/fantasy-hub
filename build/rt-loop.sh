#!/usr/bin/env bash
# One run of the RT workflow, and one link in a chain of runs.
#   In a window (a game live, or a kickoff within LEAD_MIN): refresh every
#   INTERVAL seconds; when the window's last game is final, one final capture.
#   Off-window: refresh if the data is older than STALE_MIN, then wait for the
#   next window - checking ESPN's schedule every OFF_CHECK seconds and waking
#   LEAD_MIN before a kickoff.
# At the end of its budget a chained run (CHAIN=1) dispatches its own
# successor, so the data no longer waits on GitHub's scheduler to land a run.
# It did not: on 2026-09-10 the */10 cron landed nothing for over an hour, and
# nothing in the four hours before that. The cron is now only how a broken
# chain restarts itself.
set -u
INTERVAL=${INTERVAL:-360}      # 6 min: 10 commits an hour, the Pages build ceiling
OFF_CHECK=${OFF_CHECK:-900}    # off-window: look at the schedule every 15 min
BUDGET=${BUDGET_MIN:-340}      # the job is killed at 355; hand off before that
MAX_LOOPS=${MAX_LOOPS:-1000}
STALE_MIN=${STALE_MIN:-55}
LEAD=${LEAD_MIN:-90}           # the same lead game-window.mjs uses for "soon"
CHAIN=${CHAIN:-0}
MIN_LIFE=${MIN_LIFE_MIN:-10}   # a run that ends younger never chains: no fast loop
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
elapsed() { echo $(( ($(date +%s) - start) / 60 )); }

sync
n=0; live_n=0; soon_n=0; was_live=0
while :; do
  n=$((n+1))
  [ "$n" -gt 1 ] && sync
  read -r w mins <<< "$(node build/game-window.mjs)"
  w=${w:-unknown}; mins=${mins:--1}
  # a schedule that cannot be read mid-game is treated as still live
  if [ "$w" = "unknown" ]; then if [ "$was_live" -eq 1 ]; then w=live; else w=off; fi; fi
  nap=$INTERVAL
  case "$w" in
    live)
      live_n=$((live_n+1)); echo "pass $n: live, refreshing"; rt
      if [ $((live_n % 5)) -eq 1 ]; then proj; fi
      commit; was_live=1 ;;
    soon)
      soon_n=$((soon_n+1))
      if [ "$was_live" -eq 1 ]; then echo "pass $n: games final for now, capturing"; rt; proj; commit; was_live=0
      elif [ $((soon_n % 5)) -eq 1 ]; then echo "pass $n: kickoff in ${mins} min, projections"; proj; commit
      else echo "pass $n: kickoff in ${mins} min, waiting"; fi ;;
    *)
      if [ "$was_live" -eq 1 ]; then echo "pass $n: window closed, final capture"; rt; proj; commit; was_live=0
      else
        a=$(age_min)
        if [ "$a" -ge "$STALE_MIN" ]; then echo "pass $n: off-window, data ${a} min old: refresh"; rt; proj; commit
        else echo "pass $n: off-window, data ${a} min old, next kickoff in ${mins} min"; fi
      fi
      nap=$OFF_CHECK
      if [ "$mins" -ge 0 ]; then
        wake=$(( (mins - LEAD) * 60 ))
        if [ "$wake" -lt "$nap" ]; then nap=$(( wake > 60 ? wake : 60 )); fi
      fi ;;
  esac
  if [ "$n" -ge "$MAX_LOOPS" ]; then echo "stopping after $n passes (test)"; break; fi
  left=$(( (BUDGET - $(elapsed)) * 60 ))
  if [ "$left" -le 0 ]; then echo "handing off after $n passes, $(elapsed) min"; break; fi
  if [ "$nap" -gt "$left" ]; then nap=$left; fi
  sleep "$nap"
  if [ "$(elapsed)" -ge "$BUDGET" ]; then echo "handing off after $n passes, $(elapsed) min"; break; fi
done

# The next link. A dispatch made with the run's own token is one of the two
# events GitHub lets start a new run; the concurrency group queues it until
# this job has finished. March to August there is nothing to keep fresh.
if [ "$CHAIN" = "1" ]; then
  if [ "$(elapsed)" -lt "$MIN_LIFE" ]; then echo "ran $(elapsed) min, under ${MIN_LIFE}: not chaining"
  else
    case "$(date -u +%m)" in
      03|04|05|06|07|08) echo "offseason: no successor" ;;
      *) if gh workflow run rt.yml --ref main; then echo "successor dispatched"
         else echo "successor dispatch FAILED; the cron restarts the chain"; fi ;;
    esac
  fi
fi
