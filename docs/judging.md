# Judging map

Rubric: Impact 30 · Use of Meta AI tooling 25 · Demo 25 · Technical depth and execution 20. Every feature below is built and maps to at least one criterion. Anything that maps to nothing is cut. Planned work that is not built is not listed.

The sentence: 100 Proof notices what it cannot establish, asks for the missing evidence, and uses that evidence to complete a contents file a claims professional can review.

| Feature | Impact | Meta tooling | Demo | Tech depth |
| --- | --- | --- | --- | --- |
| 5-minute session in 30-second clips, each reviewed by Muse Spark 1.3 while filming continues | x | x | x | x |
| Narration transcribed by Muse Voice Transcribe 1.0 and attached to lines with clip times | | x | x | x |
| Each line says whether its count and model are settled, and what would settle them | x | x | x | x |
| Ranked evidence requests: dollars in doubt over effort, three at a time, asked live during filming | x | | x | x |
| Label, receipt, picture, or typed answer settles one line; a focused clip settles a count | x | x | x | |
| Item record with sources kept apart and a change log | x | | x | x |
| "Still open" queue and exceptions in a versioned JSON claim file; CSV with sources | x | | x | x |
| Replacement in the property zip, exact product or a comparable, cash value after depreciation | x | x | | x |
| Saved inventories in Supabase: forced RLS by org, private media with expiring links, optimistic versions | | | | x |
| Location as a within-1-mile result; coordinates never saved | x | | | x |
| Cost ledger per model call; guided-versus-unguided eval harness | | x | | x |
| Measures per inventory: lines settled, still open, changed by evidence, time to file, model calls and latency | x | x | x | x |
| Public Information page: the questions people search for, answered with sources; FAQ markup; answer bots allowed | x | | | |

## Demo, 2 minutes, one room

Filmed in one take on a phone. Any shortcut or recorded fallback is labeled on screen.

| Time | On screen | Said |
| --- | --- | --- |
| 0:00 | My inventory, New scan, title and address, Next asks for location, teal check | "Contents claims stall when there is no list. Regulators tell people to film each room. This does that job." |
| 0:15 | Filming the room, narrating: "the TV is about three years old" | "Each 30-second clip is reviewed by Muse Spark while I keep filming. What I say is transcribed separately and attached to the line." |
| 0:35 | Live hint: "Step back and film every dining chair in one view." | "It counted two chairs and says it is not sure. It asks for the one thing that would settle it." |
| 0:50 | One more clip, wide, all four chairs | "That clip was filmed to settle the chairs." |
| 1:00 | Live hint for the TV label, Snap it, the line changes model and price | "The label settles the model. The price moves because the model did." |
| 1:15 | Stop. The list, the TV's Evidence panel: camera at 0:12, "you said", exact product with date, the change from the label | "Every fact says where it came from. The camera, what I said, the label, the comparable." |
| 1:35 | Still open: one line left; Claim file (JSON) download, the exceptions block | "What it could not settle is listed, not guessed. An adjuster sees it first." |
| 1:45 | View summary → Measures: lines settled, changed by evidence, first clip to last change, model calls | "This is what we measure on every file: how much arrived settled, what the evidence changed, and how long it took." |
| 1:50 | EVAL.md table | "Guided against unguided on the same video. It does not decide coverage, and it is not 100% accurate. It shows what it knows and what it does not." |

## What not to say

That the list is 100% accurate, that a policy is bound, or that 100 Proof decides coverage. That it is an adjuster or tells anyone what an insurer will pay. That Meta certified the result. Price hypotheses in `docs/GTM.md` are not shown on the site or in the demo.
