#!/usr/bin/env bash
# Measure a page before and after a change. Usage: scripts/perf/measure.sh <url> <label>
# Writes perf/<date>-<label>.json and prints LCP / INP / CLS / TBT / JS bytes so the PR can cite both runs.
set -euo pipefail
URL="${1:?url}"; LABEL="${2:?label}"; mkdir -p perf
OUT="perf/$(date +%Y%m%d-%H%M)-${LABEL}.json"
npx --yes lighthouse "$URL" --quiet --chrome-flags="--headless --no-sandbox" \
  --only-categories=performance --form-factor=mobile --throttling-method=simulate \
  --output=json --output-path="$OUT"
node -e '
const r=require(process.argv[1]);const a=r.audits;
const g=k=>a[k]&&a[k].numericValue;
console.log(JSON.stringify({url:r.finalDisplayedUrl,score:r.categories.performance.score,
 lcp_ms:g("largest-contentful-paint"),inp_ms:g("interaction-to-next-paint"),cls:g("cumulative-layout-shift"),
 tbt_ms:g("total-blocking-time"),js_bytes:g("total-byte-weight")},null,2))' "$OUT"
echo "Saved $OUT"
