# Research layer

Research only. Nothing here is shown in the app, the camera, the inventory page, an export, or the claim file.

| Part | Where |
| --- | --- |
| Scan counters, collected by the camera and saved on the inventory document as `scanStats`. They are never read back or displayed. | `apps/web/lib/scan-stats.ts` |
| Metrics per scored run, side-by-side compare, and the trend | `apps/web/research/scan-metrics.ts` |
| Demo comparison cards: each feature beat, the same walk without and with the step | `apps/web/research/demo-compare.ts` |
| The command | `apps/web/scripts/metrics/run.ts` |
| Records, one per scored run | `docs/research/scan-metrics.json` |
| Trend across all runs (generated) | `docs/research/SCAN_METRICS_TREND.md` |
| Demo cards for the latest run (generated) | `docs/research/DEMO_COMPARE.md` |

The app never imports `apps/web/research/`. The harness fails if any file under `app`, `components`, or `lib` does, and it checks that the claim file and the CSV carry no scan counters.

## Recording a scored run

1. Export the inventory's saved document as JSON: the `document` column of its row in `inventories`.
2. Write the scorer's input for `scoreRun` as JSON. That is the per-entry credited counts, the extras, the pending and included units, and the Reminders checkbox, `remindersOn`.
3. Run `corepack pnpm --filter @100proof/web metrics add --run 1 --doc <document.json> --score <score.json> --build <commit>`.
4. Compare two runs with `metrics compare 1 2`. Regenerate the trend with `metrics summary`.

The files hold counts only: no media, address, or narration. The accuracy rate is stated only under the five-run rule in `docs/SCORECARD.md`.

## What each record holds

Match score, capture rate, and precision against the hand inventory. Lines listed before merging, repeats merged, and the duplicate rate before and after. Hand-list brands read. Read-twice agreement and unsure lines over $250. The photo check's same, different, and unsure counts. Reminders asked and the Not-here rate. Room prompts per clip. The proof ledger's shares of the total. Filmed seconds. Each record carries the run number, the build, and when it was recorded.
