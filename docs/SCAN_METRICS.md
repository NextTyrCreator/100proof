# Scan metrics

Counted from the saved inventory and `cost_ledger`. These are not an accuracy rate. A line is assessed only when its confidence is 75% or above. A receipt is 99%. A scored walk against a hand-made reference list is `docs/SCORECARD.md`; the full-house time and price study is `docs/HOUSE_STUDY.md`.

## Test 4 — Texas Home

Inventory `d073f519-92a7-4743-b923-fa2ca17b6926`. Counted 2026-11-01 from the rows written that day. Confidence was not stored on this file. The "settled" flag on that run treated a missing answer as yes, so 209 settled lines are not a confidence score.

| Metric | Value |
| --- | --- |
| Clips | 20 |
| Filmed | 9.4 minutes (566,939 ms) |
| Created to sealed | 10.2 minutes |
| Lines | 214 |
| Rooms | 11 |
| With a brand | 23 |
| With a model name or number | 2 |
| With a color | 125 |
| With a condition | 0 |
| With an age | 0 |
| Priced as the exact product | 0 |
| Priced as a comparable | 195 |
| Tied to a clip and a second | 186 |
| With a saved picture | 0 |
| Replacement sum | $63,832 |

| Call | Count | Ok | Average | 90th percentile | Sum |
| --- | --- | --- | --- | --- | --- |
| List | 20 | 20 | 42.4 s | 56.6 s | 848 s |
| Price | 12 | 12 | 16.3 s | 19.7 s | 195 s |
| Narration | 20 | 20 | 4.2 s | 5.1 s | 85 s |
| Glance | 82 | 0 | 0.3 s | 0.7 s | 28 s |
| Reconcile | 1 | 1 | 26.7 s | 26.7 s | 27 s |

## Test 5 — Conroe

Inventory `161e0f68-b468-4a5e-819f-cd0d7862153d`. Counted 2026-11-01. Your notes on 23 lines are the corrections for the next walk. Confidence percents were not stored on this file.

| Metric | Test 4 | Test 5 |
| --- | --- | --- |
| Clips | 20 | 23 |
| Filmed | 9.4 min | 11.1 min (664,465 ms) |
| Created to sealed | 10.2 min | 13.7 min |
| Lines | 214 | 134 |
| Rooms | 11 | 7 |
| With a brand | 23 | 21 |
| With a model name or number | 2 | 2 |
| With a condition | 0 | 133 |
| With a saved picture | 0 | 122 |
| Tied to a clip and a second | 186 | 122 |
| Over $250 | — | 38 |
| Declared, with a note | — | 23 |
| Replacement sum | $63,832 | $63,939 |
| Exact duplicate names in one room | — | sectional sofa, twice |

| Call | Count | Ok | Average | Sum |
| --- | --- | --- | --- | --- |
| List | 23 | 23 | 33.1 s | 762 s |
| Price | 10 | 10 | 32.5 s | 325 s |
| Narration | 23 | 23 | 4.2 s | 96 s |
| Glance | 115 | 0 | 0.3 s | 36 s |
| Reconcile | 1 | 1 | 28.8 s | 29 s |

Listing got faster per clip (42 s to 33 s). Price searches got slower (16 s to 33 s) on fewer calls. The live scanner failed all 115 times and kept going, because a failed model call still came back as a normal empty answer.

## Hypothesis for the next walk

From the notes on Test 5, not from a scored truth list.

1. A label close-up has to land on that garment. The John Varvatos jacket was also listed as a generic men's jacket.
2. A shape that is the brand, such as the clog, should become a likely brand, not an unspecified shoe.
3. The same sofa or nightstand in one room is one line with a count. A part of an object, such as a piece of the same gun, is not a second line.
4. A price you state should stay on the line, and the comparable should not sit several times above it unless the piece is a different class.
5. A luxury finish is priced as a high-end comparable. A set of plates or glasses is one unit price times a real count.
6. Seasonal items are marked seasonal. The picture on the row is labeled with the line name so a wrong frame is obvious.
7. A known model is assessed at 75%. A receipt stays 99%. Two possible versions wait for the receipt.

## Next run

Fill this after the walk. Do not copy the Test 4 settled count forward.

| Metric | Value |
| --- | --- |
| Date | |
| Clips | |
| Filmed minutes | |
| Lines | |
| With a brand | |
| With a model name or number | |
| Assessed (75% or above under $250, 85% or above over) | |
| Receipt at 99% | |
| Over $250 waiting for a receipt | |
| Replacement | |
| Assessed replacement | |
| List average | |
| Price calls | |
