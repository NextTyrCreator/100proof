# Judging map

Rubric: Impact 30 · Use of Meta AI tooling 25 · Demo 25 · Technical depth and execution 20. Every feature below is built and maps to at least one criterion. Anything that maps to nothing is cut. Planned work that is not built is not listed.

The sentence: 100 Proof notices what it cannot establish, asks for the missing evidence, and uses that evidence to complete a contents file a claims professional can review.

| Feature | Impact | Meta tooling | Demo | Tech depth |
| --- | --- | --- | --- | --- |
| 15-minute scan in 30-second clips, reviewed by Muse Spark 1.3 while filming continues. Two clips are reviewed at once and applied in order. Scan more adds up to 5 minutes | x | x | x | x |
| Narration transcribed by Muse Voice Transcribe 1.0 and attached to lines with clip times | | x | x | x |
| Each line says whether its count and model are settled, and what would settle them | x | x | x | x |
| Ranked evidence requests: dollars in doubt over effort, three at a time, asked when paused | x | | x | x |
| Label, receipt, picture, or typed answer settles one line; a focused clip settles a count | x | x | x | |
| Item record with sources kept apart and a change log | x | | x | x |
| "Still open" queue and exceptions in a versioned JSON claim file; CSV with sources | x | | x | x |
| Replacement in the property zip, exact product or a comparable, cash value after depreciation | x | x | | x |
| Saved inventories in Supabase: forced RLS by org, private media with expiring links, optimistic versions | | | | x |
| Location as a within-1-mile result; coordinates never saved | x | | | x |
| Cost ledger per model call; guided-versus-unguided eval harness | | x | | x |
| Measures per inventory: lines settled, still open, changed by evidence, time to file, model calls and latency | x | x | x | x |
| Accuracy mark per line: nine evidence signals, Strong without a receipt, receipt confirms individuality | x | x | x | x |
| Research loop: corrections become labelled failures, one lever changes, the eval gates it | x | x | | x |
| Testing engine: deterministic harness over the mark, invariants, ranking, and scorer; invariants exported per file | | | x | x |
| Governance: versioned standard in every file, compliance register, sealed hash and change trail | x | | x | x |
| Public Information page: the questions people search for, answered with sources; FAQ markup; answer bots allowed | x | | | |
| Full-screen camera: time left, clip number, a record/pause shutter, Done, a front/back switch, and zoom only when the camera supports it. The inventory name and address are hidden while filming | | | x | x |
| New-inventory wizard: name, then country, then address, one at a time in the same place, with a Back arrow. The address is verified in place, within 1 mile of the device, and the device coordinates are never saved. Begin scan opens the camera at once | x | | x | x |
| Room chips, with each tap stored on the clip: Front entrance, Primary bedroom, Hallway, Gym, and More. A tap sets the room from that second, and the next clip starts there. Until a room is tapped, the camera says to tap the room. If the listing sees a different room, the camera asks, and nothing moves unless the person says yes | x | | x | x |
| Name cleanup: a room prefix and placeholder words are stripped from the line name, on new lines and on saved lines when they open | | | x | x |
| Hand-walked scorecard (2026-11-03, 40 entries, 60 units, four rooms) and the five-run rule in `docs/SCORECARD.md`. The rate is the average of five scored walks and stays withheld until five scored runs exist. No run has been scored. 95 is a research bar, not a claim | x | | | x |

## Demo

The current timed script is [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md).

## What not to say

That the list is 100% accurate, that a policy is bound, or that 100 Proof decides coverage. That it is an adjuster or tells anyone what an insurer will pay. That Meta certified the result. Price hypotheses in `docs/GTM.md` are not shown on the site or in the demo.
