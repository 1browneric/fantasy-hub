#!/usr/bin/env bash
# One RT pull: fetch the guest pages, rebuild projections, commit. No loop.
# Live NFL scoring comes from ESPN on the phone (docs/js/sources/espn.js), so
# RT only needs a few pulls a week (Eric, 2026-10-29) - see rt.yml's schedule.
# Each slot has a retry cron 40 minutes later because GitHub's scheduler drops
# and delays runs; the retry exits at once if the first one already landed.
# FORCE=1 (a manual run) always pulls.
set -u
FRESH_MIN=${FRESH_MIN:-30}
FORCE=${FORCE:-0}

git fetch -q origin main && git reset -q --hard origin/main
age=$(node -e "const d=require('./docs/data/rt/SoFi.json');console.log(Math.round((Date.now()-new Date(d.fetchedAt))/60000))" 2>/dev/null || echo 9999)
if [ "$FORCE" != "1" ] && [ "$age" -lt "$FRESH_MIN" ]; then
  echo "RT data is ${age} min old: this slot already pulled"; exit 0
fi

node build/rt-fetch.mjs   || echo "rt-fetch refused this pull; last good data kept"
node build/build-proj.mjs || echo "build-proj failed this pull"

git add docs/data/rt/*.json docs/data/proj.json
if git diff --cached --quiet; then echo "no change"; exit 0; fi
git commit -q -m "rt: guest data $(date -u +%Y-%m-%dT%H:%MZ)"
for t in 1 2 3; do
  if git pull -q --rebase origin main && git push -q; then echo "pushed"; exit 0; fi
  sleep 5
done
echo "push failed after 3 tries"; exit 1
