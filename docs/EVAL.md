# Eval: guided versus unguided

The claim: asking for the right evidence makes the contents file more correct. The test reviews the same recorded walkthrough twice with the same code the app uses, once as it comes back and once after the ranked requests are answered, and scores both against a list someone wrote down by hand.

How eval results, live corrections, and outside research turn into the next change is `docs/RESEARCH_LOOP.md`. Every line also carries an accuracy mark (`apps/web/lib/accuracy-mark.ts`): the goal is Strong without a receipt; a receipt confirms that the item belongs to this person.

## The testing engine (always on)

```
corepack pnpm --filter @100proof/web harness
```

Deterministic, no model calls, exit 1 on failure: accuracy-mark tiers, invariant/outlier checks, evidence
ranking, and the scorer's wrong-but-settled detection. This is the floor under every change; the eval below
is the ceiling. Governance for both is `docs/GOVERNANCE.md`; user testing after these pass is
`docs/USER_TESTING.md`.

## Running a case

A case is a JSON file next to its media in `apps/web/scripts/eval/cases/`. That folder and `results/` are ignored by git: they hold video of a home and what was said in it. `apps/web/scripts/eval/example.case.json` shows the shape.

```
corepack pnpm --filter @100proof/web eval scripts/eval/cases/<case>.json
```

The script reads `META_MODEL_API_KEY` from `apps/web/.env.local` or the shell, and needs `ffmpeg` on the path for WebM clips. It prints both scores and writes the full result, with every line and every request, to `results/`.

- `clips`: the 30-second clips in the order filmed, each with an optional 16 kHz mono WAV of the narration.
- `truth`: one entry per line a reviewer would write. `count` is how many there are. `brand` and `model` only when they are known. `replacementUsd` is one unit, new, like kind and quality, in that zip.
- `evidence`: what the person could give if asked, keyed by truth name: a `label` or `receipt` picture, an `answer`, or a `wider` clip.
- `maxRequests`: how many ranked requests guidance answers. Default 5.

Guidance answers only what the app asked for. A request with no matching evidence in the case is counted as asked and not answered, the same as a person who skips it.

## Measures

| Measure | Meaning |
| --- | --- |
| found | Truth lines that appear on the inventory, matched by name, type, and brand |
| count right | Truth lines with the exact count |
| identity right | Brand and model match, where the truth has them |
| value within 25% | Replacement per unit within 25% of the truth |
| median value error | Median of the absolute error over the truth amount |
| open lines | Lines whose count or identity is not settled |
| wrong but settled | Lines marked settled that are wrong. Target 0 |
| extra lines | Lines with no truth line: duplicates or things not on the list |

Cost comes from the same call records as `cost_ledger`: calls, failures, latency, bytes, and audio minutes per call type. Transcription is priced at $3 per 1,000 minutes. The text model's price is not reported by the API response, so the eval counts its calls and time instead of guessing a dollar figure.

## Live phone test

The eval scores a recorded case. A live test measures the work: how long it takes a person to get from the first clip to a file a reviewer can work from, and how much of that file still needs follow-up. Every saved inventory shows these under View summary → Measures, and the Claim file (JSON) carries them in `measures`.

| Measure | Where it comes from |
| --- | --- |
| Filmed time and clips | The clips on the inventory |
| Lines, settled share | Lines whose count and model are both settled |
| Still open, dollars in doubt | The open evidence requests and their ranked amounts |
| Left for the reviewer | Requests the person chose "Leave it" on |
| Changed by evidence | Lines changed by a label photo, receipt, photo, clip, or answer, and the count of each |
| Accuracy marks | Lines per mark (receipt verified, strong without a receipt, settled or estimated from video, needs evidence), the strong-without-receipt share, and evidence signals per line |
| Your edits | Changes typed by hand |
| First clip to last change | Upper bound on time to a reviewable file; includes waiting |
| Model calls | From `cost_ledger`: calls, failures, median latency, and audio minutes per call type, and the transcription cost |

### Checklist for one session

1. Open the phone tunnel URL in Safari or Chrome. Sign in with the email code.
2. Add an inventory. Choose the address and allow location when asked on Next.
3. Before filming, write the truth list for one room on paper: each thing, how many, brand and model when known. Start a stopwatch.
4. Film the room in 30-second clips, under 10 minutes, saying the room, the brand, the year bought, and the price paid of anything that matters. Watch that the scanner names what is in view.
5. Answer the live requests while filming, or "Not now". After the last clip, work the "Worth a minute" list: add photos and receipts, answer questions, film a wider clip when asked, or "Leave it". Try Connections with one receipt file.
6. Stop the stopwatch when you would hand the file to an adjuster. Write down the minutes you were actually doing something (hands-on) and the minutes you waited for a review.
7. Open View summary → Measures. Copy the numbers into the table below and download the Claim file (JSON).
8. Compare the inventory against the paper list: lines found, counts right, brand and model right, and any line marked settled that is wrong.

Record the session without the address or anything that identifies the home.

### Latency check (scan pipeline v2)

ADR 0010 targets review that keeps pace with filming. After a session of 10 or more clips, read `cost_ledger` for that inventory and fill in one row. It passes when the median listing is under 45 s, no request reaches 100 s (the tunnel's limit), failed calls are under 5%, and the last price lands within 90 s of Done.

| Date | Clips | Listing median / p90 s | Price batch median s | Glance median s | Failed calls (code) | Done to last price s | Lines before / after repeat check |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

| Date | Room | Truth lines | Lines | Settled | Wrong but settled | Changed by evidence | Left for reviewer | Hands-on min | First clip to last change | Clip review median s | Failed calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | | |

## Results

No case has been run yet. Results go here with the date, the case name (not the address), both scores, the requests asked and answered, and the cost. Until then the goals in `docs/GTM.md` are goals, not results.

| Date | Case | Truth lines | Found | Count right | Identity right | Value within 25% | Wrong but settled | Open lines | Asked / answered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | unguided → guided | | | | | | |
