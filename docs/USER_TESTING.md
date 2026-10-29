# User testing

People outside the build test 100proof only after it passes our own gates. Their reports are labels for the
research loop, not testimonials, until the numbers say otherwise.

## The gates before anyone is invited

1. `pnpm --filter @100proof/web harness` passes.
2. At least one recorded eval case (`docs/EVAL.md`) with wrong-but-settled at 0 guided, and the mark
   distribution recorded.
3. One full phone session by Steven against a hand-written truth list, with Measures copied into EVAL.md.
4. The claim file from that session re-checked by the invariants with no blockers.

## Who

- 5 homeowners or renters who have never seen the app, on their own phones, in their own homes.
- 2 claims professionals (adjuster, examiner, or administrator staff) reviewing files, not filming.
- Nobody is paid in coverage promises; nobody's real claim is used.

## What they do

1. From the home screen only: get to filming. (Do they find the email step?)
2. Film one room in under 5 minutes, narrating as they go.
3. Answer or skip the asks as they choose.
4. Open the summary. Find: the replacement total, the least certain line, and what would settle it.
5. Download the claim file and send it as they would to an insurer.
6. Reviewers: open a file cold and list what they would still need to ask for.

## What they report (the experience form)

- Device and browser; room filmed; minutes filming and minutes total.
- In their words: what they thought the app was asking at each step; anything they ignored and why.
- Lines they know are wrong or missing (this is truth data, with their consent to use it as a label).
- The mark on three lines they choose: did the mark match how sure they felt?
- Would they trust sending this file to their insurer? What one thing would change their answer?
- Reviewers: minutes to a reviewable opinion; what they still needed; whether exceptions-first helped.

## How reports are used

- Reports are sorted into the failure taxonomy (`docs/RESEARCH_LOOP.md`) within a day. A report that does not
  fit the taxonomy extends it.
- No report becomes an eval case, a quote, or marketing copy without explicit consent. No addresses, no
  coordinates (the product stores none), no claim numbers.
- Findings are written into `docs/EXPERIMENTS.md` as the next hypotheses, one lever each, and re-tested
  through the eval gate before they ship.
- A summary of what changed because of testers is added to `CHANGELOG.md`; testers are thanked, not named.
