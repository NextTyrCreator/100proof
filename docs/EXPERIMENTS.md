# Experiments

One hypothesis, one lever, one gate (`docs/RESEARCH_LOOP.md`). An experiment is written before the change is
made. Statuses: proposed, running, adopted, rejected. The gate is the eval in `docs/EVAL.md`: count-right and
identity-right must not fall, value-within-25% must not fall, and wrong-but-settled must not rise.

Template:

```
## H-NNN — short name
- Failure it answers (taxonomy in RESEARCH_LOOP.md):
- Hypothesis: changing X will move metric Y by Z, because …
- Lever (one only):
- Cases / sessions:
- Result (unguided → guided, before → after):
- Decision:
```

## H-001 — Accuracy mark as the live scoreboard

- Failure it answers: none directly; it makes every other failure visible per line.
- Hypothesis: marking each line by its evidence signals will raise the strong-without-receipt share across
  Steven's phone sessions, because the person filming can see which line needs one more signal and which
  signal it is.
- Lever (one only): the mark itself (`lib/accuracy-mark.ts`), shown on lines and in Measures. No prompt or
  threshold changed.
- Cases / sessions: phone sessions per the `docs/EVAL.md` checklist, starting 2026-10-29.
- Result: baseline pending the first recorded session.
- Decision: running.

## H-002 — Narrate-the-valuable prompt

- Failure it answers: identity wrong or unsettled on high-value lines with no narration.
- Hypothesis: asking the person, while filming, to say the brand and age of anything valuable will raise
  identity-right on high-value lines without raising asks skipped, because the answer costs no extra trip.
- Lever (one only): the live guidance copy. No threshold changed.
- Cases / sessions: next two recorded walkthroughs with a hand-written truth list.
- Result: not run.
- Decision: proposed.

## H-003 — Listing reasoning effort

- Failure it answers: slow review and incomplete answers (the 11-clip test: listing median 38.4 s, six 502s).
- Hypothesis: listing with reasoning effort low instead of medium will cut the listing median by a quarter
  without lowering found, count-right, or identity-right, because the clip itself carries most of the signal.
- Lever (one only): `reasoning.effort` on the listing call. Output limit, prompt, and pricing unchanged.
- Cases / sessions: the same recorded case run twice through `scripts/eval/run.ts`, medium then low.
- Result: not run.
- Decision: proposed.
