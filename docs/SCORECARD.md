# Walkthrough scorecard

How 100proof measures whether a scan put the right things on the list. One small space was inventoried by hand first. Every scan of that space is scored against that list, unit by unit, before any manual edit.

Nothing on this page is a public accuracy claim. The match score is a benchmark against one reference list. The percentages on a line in the product (75, 90, 95, 99) are confidence tiers from the evidence rules, not this score.

## Why a hand list, and why on 2026-11-03

Four filmed walks of a full house (Tests 2 to 5 in `docs/SCAN_METRICS.md`) produced counts, costs, and a list of corrections, but no accuracy number, because there was no reference to score against. A reviewer watching the video and the inventory side by side can say what looks wrong; they cannot say what fraction was right.

On 2026-11-03 the decision was to make a reference the right way around: inventory a small personal space by hand first, with no preparation of the space beyond doing the inventory, and treat that handwritten list as the truth the scan must reproduce. The space is a front entrance, one bedroom, a hallway, and a home gym.

- The hand walk took about 20 minutes. It was written on two pages (40 numbered rows).
- Transcribing the two pages into the workbook, settling the counting rules, and building the scoring sheet took about another 30 minutes. Claude Fable 5.1 and Muse Wonder read the handwritten pages. The scorecard was then implemented with Claude Fable 5.1. About an hour in all.
- The workbook is `100Proof_Personal_Property_Inventory.xlsx`. The same baseline, counting rules, and scoring arithmetic are in `apps/web/lib/scorecard.ts`, and the harness checks them.

The owner walked and wrote the list and attests to it. That is what makes it usable as a reference. It does not make the product accurate; it makes the product measurable.

The reasoning behind the design came from reading how contents claims are adjusted and what is required for a loss to be paid: a claim is paid against an itemized list, one unit at a time, and an item that is not on the list, or is on it twice, is where the dispute starts. The same reading pointed at why people do not keep an inventory: a full hand inventory takes hours, and a value a person declares from memory is often not the value they are paid later. The product is built around the first problem (the walk replaces the hours) and the scorecard is built around the second (the list has to be right before the value matters). No statistic from that reading is repeated here; the house-study table in `docs/HOUSE_STUDY.md` keeps the published hand-inventory times with their sources.

## The baseline (v0.1, provisional)

| Room | Entries | Test units | Owner estimate |
| --- | --- | --- | --- |
| Front entrance | 13 | 17 | $325 to $345 |
| Bedroom 1 | 17 | 19 | $1,410 |
| Hallway | 3 | 16 | $160 |
| Gym | 7 | 8 | $3,000 |
| Total | 40 | 60 | $4,895 to $4,915 |

The owner amounts are provisional estimates written on the hand list. They are not replacement prices and are not used to score the scan. Brands written on the hand list (Vizio, Honeywell, Marshall, eero, Bowflex, Fitness Gear, Peloton, TISSCARE, OOFOS, Crocs) are scored separately later; this first score is identity, quantity, and inclusion only.

Counting rules, applied to both the hand list and the scan before matching:

1. A plant with its vase is one arrangement.
2. A pair of shoes is one pair.
3. A bedding set with its sheets is one set.
4. Two dumbbells are two units.
5. The 185 lb plate collection is one lot until its plate count is known.
6. Decor, frames, books, and blankets count as the distinct pieces the hand list names (5 decor at the entrance, 8 in the hallway, 3 frames, 2 books, 6 blankets).
7. Entry 3 ("plant with vase, 2 noted") is one arrangement in v0.1. If that changes, the baseline gets a new version; past runs are not rescored.

Two items on the list are deliberately hard: the antique telephone is inside the dresser, and the trash can is on the list even though the scan's not-property rule drops trash. The telephone tests whether the walk exposes what it should; the can tests that the rule drops the contents, not the container.

## Scoring one run

Score the original automatic output, before any edit. Match each expected unit at most once.

| Term | Rule |
| --- | --- |
| True positives (TP) | Expected units correctly included. |
| False negatives (FN) | Expected units missing. FN = expected − TP. Units the walk never put on camera are still misses, tagged as an exposure issue. |
| False positives (FP) | Every extra included unit, one primary category each: duplicate, phantom or misidentified, or improper inclusion (a real object outside the scope or excluded by a rule). |
| Match score | TP / (TP + FN + FP). The combined benchmark. |
| Capture rate | TP / expected. Completeness only; it can be 100% while extras remain. |
| Precision | TP / included units. Unavailable when nothing was included. |
| Correct exclusion | A disclosed decision to keep an observation off the list. Not an error, not extra credit. |
| Pending | An inclusion decision that is not yet resolved. One pending unit withholds the final score. |

Reconciliation is required: TP + FN must equal 60, and TP + FP must equal the units in the included output. A count that does not reconcile is rejected, not clamped. A row credited above its target, or a negative or fractional count, is rejected.

PASS requires a confirmed baseline, all 60 units included, FP = 0, no pending decisions, and a finished review. Anything else is "Needs work" with the misses and extras listed.

Acceptance cases the harness runs: 60 correct and no extras is 100.0% and PASS. 60 correct plus one improper inclusion is 60/61 = 98.4%, capture 100%, Needs work. 59 correct and one missing is 98.3%. 59 correct plus one duplicate is 59/61 = 96.7%. One unresolved decision withholds the score. An included count of 61 with FP declared 0 is rejected. An empty output is 0.0% with precision unavailable.

## How a run is recorded

Each run keeps: date, build, baseline version, the per-entry credited counts, duplicate / phantom / improper units, unexposed units, pending units, included units, and the reviewer's notes. The raw automatic output is kept unchanged; the reviewed inventory is a separate version, and a manual correction never improves the historical automatic score.

| Run | Date | Build | TP | FN | FP | Match | Capture | Precision | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | | | | | | | | | | |
| 02 | | | | | | | | | | |
| 03 | | | | | | | | | | |

No run has been scored yet. For repeatability the target is three consecutive complete passes at a modest change of angle or pace, with every failed run and its build kept.

## What this score does not cover

Brand, model, serial, condition, value, and coverage each need their own reference data and their own field-level test. The house study (`docs/HOUSE_STUDY.md`) covers time and prices on a full house. This scorecard covers the list.
