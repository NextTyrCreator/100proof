# 100proof features

100proof turns one walk through a home, filmed on a phone, into an itemized personal property inventory. Every line says what proves it: the camera, what the owner said, a label, or a receipt. It was built for the Meta Global AI Developer Hackathon (Oct 26 to Nov 4, 2026), theme Build for Your World. It does a job people are already told to do, filming their rooms before a loss, and almost nobody finishes.

Two Meta models run in the product: Muse Spark 1.3 and Muse Voice Transcribe 1.0. 100proof does not decide coverage, does not bind a policy, and does not claim to be 100% accurate. No accuracy rate is stated until five scored walks agree (see the last section).

**Status** tells you what exists today. **Built** is on `main` and checked by the harness or a saved walk. **Partly built** names what exists and what is planned. **Planned** is specified in `docs/SCAN_PREP_PLAN.md` (section in brackets) and is not built yet.

## Headline capabilities

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| **Read twice** | Every item over $250 is identified twice, independently, before its identity counts | Agreement gets a clean confirmation, and disagreement is flagged unsure with both candidates shown. On the items that matter most, the system shows its own uncertainty instead of guessing | Planned, core (14.1) |
| **Proof ledger** | Shows how much of the inventory total is proven: "Of your $10,000, this much is proven" | Splits the total into four evidence bands: receipt confirmed, seen and identified, seen and estimated, and stated but not seen | Planned (14.2) |
| **Before-and-after walk** | A second walk is matched object by object to the first: new, moved, condition changed, or not seen | Says "Not seen in this walk", never missing or stolen. Rooms the second walk did not enter are "Not checked" | Planned, on a scan-more walk (14.4) |
| **Tap to replay** | Tap any line to play the exact seconds it was filmed, with the narration captioned underneath | Every line can be checked back to its source second, including lines that were only said | Planned (14.3) |
| **What-belongs-here prompts** | On pause, a short reminder of what a room like this usually has that was not filmed | A prompt, never a completeness claim. At most three per room, each with a reason | Planned (14.5) |
| **Research you approve** | Price findings are shown as a question, and the owner approves or adjusts them | Research is never applied silently. "Apply research automatically" is off by default | Planned (9.4) |

## Capture

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| Live phone-browser scanning | Film the home in the phone's browser, with no app to install | The walk is recorded live in 30-second clips, up to 15 minutes. It is not an upload of an old file, so the record is of this place at this time | Built |
| Auto-upload to evidence storage | Each clip, its poster, and its stills go to a private Supabase bucket as the walk happens | Media is stored per organization and inventory, behind forced row-level security and expiring links | Built |
| Full-screen camera | The camera fills the screen with the time left, the clip count, record and pause, Done, a front/back switch, and zoom where the lens supports it | The inventory name and address are hidden while filming. Zoom shows only when the camera truly zooms | Built |
| New-inventory wizard | Name, country, and address are asked one at a time in the same place, with Back on each step | The address is verified in place: within 1 mile of the device, and the coordinates are never saved | Built |
| Narration as evidence | What the owner says is transcribed by Muse Voice Transcribe 1.0 and tied to lines by clip time | A brand, price paid, or year said aloud lands on the line it belongs to | Built |
| Room seed list | Front entrance, Primary bedroom, Bedrooms 2 to 5, Hallway, Bathrooms 1 to 3, Gym. Closets fold into their room | Four demo starters (Front entrance, Primary bedroom, Hallway, Gym) plus More, tapped on the camera to mark the room from that second | Built |
| Room-mismatch prompt | When the listing sees a different room than the one tapped, the camera asks before any line moves | "Switch to Gym" moves that clip's later lines and keeps filming there. "Keep Primary bedroom" leaves them. Nothing moves unless the person says yes | Built |
| Clip labels by room | The saved inventory's video list names each clip by the rooms tapped in it | "Clip 3 · Hallway, Gym", or "Clip 3" when nothing was tapped | Built |

## One object, one line

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| One-object-one-line tracing | The same object seen in several clips, or from two rooms, becomes one line | Lists what was seen first, decides what is the same object second, and sorts into rooms last. Rules propose, and Muse Spark 1.3 confirms with both stills | Partly built: repeats join within a room. Across clips and rooms is planned (5) |
| Merge screen | Possible repeats show as a question mark while paused, as side-by-side cards with Same item, Two items, or Not sure | An auto-merge toggle merges only pairs where the rules and the model agree. "Undo" is always one tap away | Planned (11) |
| Bulk and decor rules | Plates, glasses, flatware, towels, and sheets become one counted "Various" line per kind. Each decor piece gets its own row | Counts are estimated and priced per piece. Sterling silver stays on its own row | Built |
| Not-property filter | Drinks, pens, trash, food, and empty shipping boxes are left off | Three labels (not listed, not contents, contents with a special limit), plus the trash-can and weight-plate fixes | Partly built: the filter exists. The labels and fixes are planned (10) |

## Identity and evidence

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| Testimony versus observation | Each object is marked seen, stated but not seen, or contradicted | The owner can name what is in a closed drawer, and the line exists with lower confidence until something shows it | Partly built: "Stated, not seen" is built. "Contradicted" is planned (7) |
| Brand evidence ladder | Every brand says how it is known: read on the object, said by the owner, partial letters with a logo, or color and shape only | Nothing is settled from color or shape alone. A likely brand is shown as "Likely …, not confirmed" | Partly built: likely brand with clues is built. The full ladder is planned (6) |
| Calibrated autonomy | The AI asks only when it is unsure: a label photo, a receipt, a wider clip, a merge, or a price | Requests are ranked by dollars in doubt over effort. A pause shows them on the camera | Partly built: evidence requests are built. Merge and research questions are planned (11, 9.4) |
| Confidence tier per line | Receipt or appraisal 99, model number 95, model name with brand 90, one similar model 75 | The tier comes from the evidence on the line, not from a number the model reports about itself | Built |
| Dynamic item names | Names are rebuilt from brand and kind, and update as identity improves: "Tower fan", then "Honeywell tower fan", then the model | The room is never inside the name, and each change is logged with its source | Partly built: the brand prefix and name cleanup are built. Names rebuilt from fields are planned (8) |
| Fields filled from what was said | Price paid, year, brand, model, and serial are filled from the narration, with the clip and second | Each stays unconfirmed until the owner taps it. A heard price is never a receipt | Planned (7) |

## Value

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| Researched value as a range | Replacement cost is a low-to-high range with its sources | A single price is shown only for a receipt, an appraisal, or an exact model match. The range is honest uncertainty, and it feeds the proof ledger | Planned (9.1). Today each line has one researched price with its basis |
| Declared value as metadata | What the owner says or types is shown as its own chip, visibly apart from researched value | A declared value never replaces research. A comparable outside half to double the stated price holds the line at 50% and asks the owner | Built: the self-declared value is separate and in red. The chip is planned (9.2) |
| Receipts lock lines | A receipt photo or PDF is read and matched to its line, which moves to tier 99 | Receipts can be added at any time after the scan, and the line updates | Built |
| Condition and damage | Visible condition and damage, with severity and the clearest second, lower actual cash value | Replacement stays the price of a new one, and a later clip's worse damage is kept | Built |

## Record and trust

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| Sealed record | Each inventory is sealed with a record hash and the time it was sealed | Every line keeps its sources apart and carries a change log of what moved it | Built |
| Claim file and CSV | A versioned JSON claim file and a CSV with sources for every line | Hidden lines are left out of totals and exports | Built |
| Homeowner delete | An inventory, its item events, and its evidence files are deleted together | The cost ledger is kept without the media, for cost and learning | Built |
| Cost ledger | Every model call, including failures, records its latency and bytes | Cost and speed are measured per scan, not estimated | Built |

## Accuracy research

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| Hand-walked scorecard | A space inventoried by hand on 2026-11-03 (40 entries, 60 units) is the reference every scan is scored against | One credited match per unit, every extra counted as an error, and reconciliation required | Built |
| Five-run accuracy rule | The accuracy rate is the average match score of five scored walks, in percent | The rate is withheld until five walks exist and agree (sample variance at most 4). The target of 95 is a bar, not a claim | Built |
| Same-clip re-runs | A saved walk is re-run after every change, and the change ships only if the score holds | Model variance on the same input is measured apart from walk variance | Planned (12) |
| Deterministic harness | More than a hundred checks with no model calls run on every change | Rules for evidence, prices, repeats, damage, and scoring are tested in code | Built |

## Muse Spark 1.3, five ways, each with a typed contract

| Feature | Benefit | How it stands out | Status |
| --- | --- | --- | --- |
| Muse Spark 1.3 in five jobs | It lists each clip from the video and transcript, reads label close-ups, prices lines by web search, reconciles repeats and fills fields at Done, and reads receipts | Every response is validated against a zod schema before it touches a line. Untrusted text is data, never instructions | Built |
| Muse Voice Transcribe 1.0 | Narration is transcribed with a time on every word | Ties what was said to the second it was seen | Built |
