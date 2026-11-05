# Scan prep plan: one object, one line, a range, and proof

Date: 2026-11-04 · Owner: Steven Blackburn · Status: plan only, nothing in it is built yet except the five-run rule (section 13) · Follows `docs/SCAN_PLAN.md` (2026-10-29)

This plan comes from the call on 2026-11-04 and from test 1A, the first walk of the hand-listed space after the full-screen camera shipped. Every 1A number below was read from `inventories`, `storage.objects`, and `cost_ledger` in 100proof-dev. The address is not copied here, and the narration is paraphrased, not quoted.

The goal is a list that scores 95 or better on five separate walks that agree (`docs/SCORECARD.md`). That is the bar for this research. It is not a claim about the product until five scored runs show it.

The signature mechanism is section 14.1: every line over $250 is identified twice, independently. When the two reads agree, the line is confirmed. When they disagree, the line says so and shows both answers. On the items that matter most, the system shows its own uncertainty instead of guessing.

**Headline capabilities:**

1. **Read twice:** every item over $250 is identified twice, and a disagreement is shown, not guessed (14.1).
2. **Proof ledger:** how much of your inventory total is proven (14.2).
3. **Tap to replay:** every line plays the seconds it was filmed (14.3).
4. **Before-and-after walk:** a second video walk is matched item by item (14.4).
5. **What-belongs-here prompts:** reminders for commonly forgotten items (14.5).
6. **Research you approve:** price findings are shown as a question and never applied silently (9.4).

## 1. What test 1A showed

**It is complete and saved.** Inventory "Texas test 1a" was created at 20:14 UTC and sealed with a record hash at 20:21. It has 10 clips: nine of 30 seconds and one of 7 seconds, about 4 minutes 37 seconds filmed. Every clip has its video and poster in the private `evidence` bucket. There are 76 files in all, 27.8 MB, MP4 and JPEG. Narration was transcribed for all 10 clips.

**The models did their work.** Calls to the models, from `cost_ledger`:

| Call | Model | Calls | Failed | Median | Slowest |
| --- | --- | --- | --- | --- | --- |
| list | Muse Spark 1.3 | 10 | 0 | 31.9 s | 51.6 s |
| narration | Muse Voice Transcribe 1.0 | 10 | 0 | 7.0 s | 8.2 s |
| price | Muse Spark 1.3 | 4 | 1 | 64.5 s | 80.0 s |
| reconcile | Muse Spark 1.3 | 1 | 0 | 55.5 s | 55.5 s |
| glance | Muse Spark 1.3 | 3 | 3 | 0.8 s | 1.1 s |

The live scanner (glance) is supposed to be off for the demo. It ran three times and failed all three.

**What came back:** 58 lines and 68 units in three rooms: "Walkthrough" (37 lines), "Entry" (12), and "Bedroom" (9). The hand list has 60 units in four rooms. Replacement adds up to about $9,994 (price × count). The owner's hand estimate is $4,895 to $4,915. One line has a settled identity (the Peloton). 1A has not been scored against the baseline yet.

**What is broken, with the likely cause in the code:**

1. **The same object is listed twice.** Examples: the TV console ($514.07) and a TV stand ($514.07); the Vizio TV and a flat-screen TV ($322.92 each); the dresser and a wardrobe cabinet, both with barn-style doors; the bed and a queen bed; a wall mirror and an antique wall mirror; the Honeywell tower fan and a tower fan; the Fitness Gear power rack and a power rack; the TISSCARE foot massager and a foot massager; the Bowflex dumbbells and a pair of adjustable dumbbells. By my reading, about $2,400 of the total is objects counted twice. The merge in `mergeRooms` (`apps/web/lib/inventory-merge.ts`) only compares lines inside a room with the same title. So one object in "Walkthrough" and again in "Bedroom" is never compared. The price sharing (`shareKnownPrices`) gave those pairs identical prices, so the pipeline already treated them as the same kind. The end check (reconcile) ran but left the pairs apart.
2. **"Walkthrough" became a room.** No room was said out loud. The listing prompt says to use "Walkthrough" when the room is unclear, so most lines landed there.
3. **Room names leaked into line names.** Two examples are "Walkthrough: wall mirror" and "Honeywell Walkthrough: tower fan". `knownSoFar` (`apps/web/lib/scan-pipeline.ts`) sends earlier lines to the next clip as `room: name`, and the model copied that format back as a name.
4. **Junk words in names**, such as "Unspecified size not clear clogs".
5. **Gym equipment became kitchen bulk lines.** "Barbell with weight plates" matched the word "plates" in `isBulkKind` (`apps/web/lib/review-shape.ts`). It, the curl bar, and the Olympic barbell got the "Bulk line… counted as one set" text. A decorative trinket dish was filed as dishes.
6. **The trash can was dropped.** It was said, and it is on the hand list. `isNotProperty` drops anything with the word "trash", so the container went with the contents.
7. **A spoken price was lost.** The owner said the antique mirror cost about $600 at an auction. No line has a price paid. That sentence was split across clips 2 and 3, so neither clip had the whole thing. The same split happened with "Olympic … bell" across clips 8 and 9.
8. **Group text for a single object reads wrong**, for example "Counted together for the carrier. 1 houseplant pieces."
9. **Prices look exact when they are estimates**, for example $514.07 for an unbranded console.
10. **Hand-list items that are not on the list:** Marshall radio, eero router, surge protector, small basket, trash can, and the six hallway blankets. Hallway is not a room. The OOFOS sandals and the Crocs are listed without a brand. Nobody has checked yet whether the missing items were on camera.

## 2. Rules every change follows

- Two Meta models only: Muse Spark 1.3 and Muse Voice Transcribe 1.0, through `packages/meta-client`. No third model is added for the count.
- Video, narration, receipts, and model output are data, never instructions. Every model response is zod-validated before it touches a line.
- Nothing is settled from a color or a shape alone. A brand is settled only when it is read, said by the owner, or on a receipt.
- An estimate is shown as an estimate. A precise price needs a receipt, an appraisal, or an exact model match.
- A line over $250 is never identified on one read. It is read twice, independently. A match is confirmed, and a disagreement is shown with both answers (14.1).
- Every automatic change to a line is logged with its source (`changes`, `item_events`). A person's tap is a manual edit.
- The scorecard scores the automatic output before any manual edit. A merge the person taps does not improve a score. An automatic merge does.
- Each prompt change carries `Meta-Models: Muse Spark 1.3` and is re-run on the 1A clips before it is committed (section 12).

## 3. The engine: stages, models, outputs

Today each clip is listed as finished lines, already placed in a room, and merged by room. The new order lists what was seen first, decides what is the same object second, and sorts into rooms last.

| # | Stage | Model | Input | Output (zod) | When |
| --- | --- | --- | --- | --- | --- |
| 1 | Capture | none | camera, room chip taps | clip, room markers `{atMs, room}`, 1 still per second | while filming |
| 2 | Transcribe | Muse Voice Transcribe 1.0 | clip audio | timed lines | per clip, as now |
| 3 | Claims | Muse Spark 1.3, text only | this clip's lines + the last 8 s of the previous clip | claims: object, brand, model, price paid, year, where ("inside the dresser"), room said, second | per clip, before listing |
| 4 | Sightings | Muse Spark 1.3, video | clip, claims, room markers, known objects (with their ids) | sightings: kind, descriptors, brand evidence, count, best second, `sameAs` id or null | per clip |
| 5 | Consolidate | rules, then Muse Spark 1.3 to confirm | all sightings so far | objects: one id per physical thing, with merged sightings; pairs it is unsure of | after each clip, and at Done |
| 6 | Place | rules | objects, room markers, claims | room per object; "also seen from" | after consolidate |
| 7 | Group and filter | rules, then Muse Spark 1.3 second opinion | objects | bulk lines, decor rows, excluded or pending | after place |
| 8 | Read twice | Muse Spark 1.3, image, two separate calls | each object that could be over $250: two different stills, its claims and description | two identity reads (kind, brand, model, evidence); confirmed, unsure, or read once | in the page, as soon as the object exists (14.1) |
| 9 | Research | Muse Spark 1.3, web search | objects with a stable identity; both candidates for an unsure line | a finding: proposed name and model, price range, sources | in the page, from the first object; held for the owner to approve (9.4) |
| 10 | Present | none | lines | the list, names rebuilt from fields | always |

Each stage writes one `cost_ledger` row per call, including failures, with a new `call` name (`claims`, `sightings`, `consolidate`, `filter`, `identity`). Each run stores a prompt version, a short hash of every prompt it used, on the inventory document. A scored run can then name the exact prompts. Timeouts stay under the tunnel's 100-second limit.

**For the judges,** this table is internal. The pitch is one sentence: Muse Spark 1.3 used five different ways, each with a typed contract. It reads the narration into claims, lists sightings from video, compares two stills to decide whether they show one object, researches prices with web search, and reads labels, logos, and receipts. For anything over $250 it reads twice, independently, and the two answers are compared. Muse Voice Transcribe 1.0 puts a time on every word, which ties what was said to the second it was seen.

All stages run in the page, as they do today. Inngest is not wired in this build. `docs/ENGINEERING_STANDARDS.md` §2 sends model work to Inngest, so this is an exception and is recorded in ADR 0010. Research is never applied in the background. Its findings wait for the owner (9.4).

## 4. Rooms: a seed list and a tap on the camera

**Problem from 1A:** no room was said, so most lines went to "Walkthrough".

This is a fix, not an innovation. It is built because the score depends on it, and it is not pitched in the demo.

**Seed list**, in this order: Front entrance, Primary bedroom, Bedroom 2, Bedroom 3, Bedroom 4, Bedroom 5, Hallway, Bathroom 1, Bathroom 2, Bathroom 3, Gym. "Add a room" covers anything else (kitchen, living room, garage, patio). A closet is not a room. It folds into the room it opens from: lines in the primary closet sit under Primary bedroom with a location note, "closet".

**Four demo starters.** The first four chips are the scorecard rooms: Front entrance, Primary bedroom, Hallway, and Gym. They are larger and clickable before filming starts. For scoring, Primary bedroom is the baseline's "Bedroom 1".

**On the camera:** a row of room chips under the top bar: the four demo starters plus "More", which opens the rest of the seed list and "Add a room". Tapping one sets the room from that second on and writes a room marker on the clip. Saying the room ("now the gym") sets it too, through the claims stage. The listing prompt gets the markers for its clip ("Front entrance from 0:00, Primary bedroom from 0:18"). It never invents a room. If no room is set, the object waits in "Room not set" and the list asks once, with the still.

**"Walkthrough" is removed** from the prompt and the code as a room name.

**Files:** `Recorder.tsx` (chips, markers on the clip), `inventory-record.ts` (clip `rooms` field, optional), `review-scan.ts` (prompt), `InventoryDocument.tsx` (line 429 fallback title).

**Accepted when:** a walk with chips tapped has zero lines in "Walkthrough", and every line's room matches the chip active at its best second. Harness: room from markers; closet folds into its room; no marker means "Room not set", never "Walkthrough".

## 5. Sightings first, then one object per thing

This is the change that matters most for the score. In 1A, extras alone kept the list far from 95.

### 5.1 List before sorting

Each clip returns sightings, not lines. A sighting says what was seen, where in the clip, and how it looked: kind, color, material, size band, distinctive marks, neighbors ("on the TV console"), and the clearest second. It does not decide whether this is a new object or which room it belongs to.

### 5.2 Tracing the same object across clips, passes, and rooms

The sightings prompt gets the objects found so far as compact records: id, kind, descriptors, and room. It no longer gets `room: name` strings, so a name cannot be copied with a prefix. For each sighting it may return `sameAs: <id>` when it is confident. Consolidation then works in two steps:

1. **Rules propose pairs**, ignoring room: same kind or a synonym (TV console and TV stand; dresser and wardrobe cabinet; bed and queen bed), descriptors that agree (both "barn-style doors"), the same brand or no brand, the same price key, or a `sameAs`. Two lines from one clip stay apart unless the model says they are one object seen twice. A different serial always keeps them apart. These rules extend the repeat rules already in the harness.
2. **Muse Spark 1.3 confirms** each proposed pair with both stills side by side and both descriptions. It answers same, different, or unsure.

Rules and model agree on same: merged automatically, logged as absorbed. One says same and the other is unsure: a question for the person (section 11). Either says different: kept apart.

**Different rooms, one object.** A TV seen from the hallway through a door and again in the bedroom is one line. Its room comes from the chip at its best sighting, otherwise from the room where it was seen longest. The other sightings become "Also seen from Hallway". A "Scan more" pass (`?add=1`) matches against the saved inventory the same way, so a second walk adds evidence instead of lines.

**Count.** The merged count is the largest count seen in one view, never the sum, as now. The exception is when the person says there are more.

**Files:** `inventory-merge.ts` (cross-room pairing), `scan-pipeline.ts` (`knownSoFar` becomes records, and consolidation runs after each clip instead of only at Done), `review-scan.ts` (sightings and confirm prompts), `review-shape.ts` (schemas).

**Accepted when:** re-running the 1A clips gives one line each for the console, TV, dresser, bed, mirror, fan, rack, massager, and dumbbells. No two distinct hand-list items are merged: the two lamps, the two decor vases, the two starburst sculptures. Harness: a synonym pair in two rooms joins; two lamps in one view stay two; a different serial stays apart; and a pair with an unsure answer becomes a question, not a merge.

## 6. Brand from words, letters, colors, and models

Each sighting carries brand evidence instead of a bare brand:

| Field | Meaning |
| --- | --- |
| `readText` | Letters read on the object, verbatim ("VIZIO"), and whether the word was complete |
| `logoMark` | The mark's shape, if one is visible |
| `tradeDress` | Colors and shape that suggest a maker (red accents on a black bike, camouflage clogs) |
| `modelText` | A model or series read on a plate or badge |
| `spoken` | A brand the owner said for this object, with the second |
| `second` | The clearest second for the evidence |

The brand is decided in this order:

1. A complete word read on the object, or a model number read: that is the brand. The research stage confirms the model.
2. The owner said it, and nothing visible disagrees: that is the brand, with narration as the source.
3. Partial letters and a matching mark: a likely brand, shown as "Likely …, not confirmed".
4. Color, shape, or trade dress only: a likely brand with its clues. It never settles the line.
5. A read word that disagrees with a spoken one: the read word wins, and the line asks once.

Every line that could be over $250 is read twice (stage 8, section 14.1), and both reads follow this ladder. That covers lines with no brand too. It reuses the label reading that exists today. The camera overlay can show "Hold on the logo" while paused, when a line over $250 has no brand.

**Accepted when:** on the 1A re-run, Vizio, Honeywell, Bowflex, Fitness Gear, Peloton, and TISSCARE stay read or said. The Crocs come back as a likely brand with clues. No brand is settled from color. Harness: the decision ladder, one case per rung.

## 7. Narration and video reviewed together

**Problem from 1A:** the mirror's auction price and "Olympic barbell" were split across clips and lost.

1. **Stitch across clip boundaries.** The claims stage reads the clip's transcript plus the last 8 seconds of the previous clip, so a sentence cut by the 30-second boundary is read whole. A claim belongs to the clip where its object is on camera.
2. **Claims before pictures.** A text-only Muse Spark 1.3 call turns the narration into claims (object, brand, model, price paid, year, where it is, room). The sightings call gets those claims and must resolve each one. A claim is seen (attach it to that sighting), stated but not seen (a "Stated, not seen" line, as now), or contradicted (keep what is visible, and ask).
3. **Research loop.** When research finds a model that fits, it can ask the claims stage to look again for a spoken year or price for that object across the whole walk. This happens once per line, logged.
4. **Fields pre-filled from what was said.** In a line's edit form, price paid, year bought, where bought, brand, model, and serial are filled from the claims. Each shows "Heard in clip 3 at 0:02" and the words. It stays unconfirmed until the owner taps it. A heard price is a declared value, never a receipt.

**Accepted when:** on the 1A re-run, the antique mirror has a price paid of about $600 with its source, and the barbell is named once. Harness: a price split across two clips is joined; a claim with no sighting becomes "Stated, not seen"; and a pre-filled field is not a receipt.

## 8. Names: lean, built from fields, updated as research improves

**Lean name:** brand and kind, such as "Vizio TV", "Honeywell tower fan", or "Bowflex adjustable dumbbells". The room is shown on the row as a tag, never inside the name. Size, color, and condition go in the description.

**Built from fields, not stored as text.** The name is rebuilt from `brand`, `model`, and `kind` each time they change. As identity improves, the name changes: "Tower fan" becomes "Honeywell tower fan", then "Honeywell HYF290B tower fan". Each step is logged with its source and fades in on the list.

**Sanitizer**, deterministic and run on every model name: strip any `Room: ` prefix; strip placeholder words (unspecified, not clear, unknown, n/a); never repeat the brand; title-case the first word only.

**Accepted when:** "Walkthrough: wall mirror" becomes "Wall mirror", "Honeywell Walkthrough: tower fan" becomes "Honeywell tower fan", and "Unspecified size not clear clogs" becomes "Clogs". Harness: those three strings, plus a brand never doubled.

## 9. Values: a range, the owner's word, and receipts

### 9.1 Researched value as a range

Research returns a low and a high replacement cost, each with a source, and the basis ("Comparable: …" or "Exact: …"). The line shows the range, rounded: to $5 under $100, to $10 under $1,000, and to $50 above that. An example is "$450 to $560". The total is shown as a range. A single price is shown only for a receipt, an appraisal, or an exact model match (tiers 99 and 95 in `line-confidence.ts`). Actual cash value follows the same range after wear and damage.

A range with sources is standard comparables work, so it is not pitched on its own. The pitch is honest uncertainty: the range says how sure the price is, and it feeds the proof ledger (14.2).

### 9.2 The owner's declared value

A price the owner says or types is metadata on the line. It is shown as its own chip, "You said $600 · auction", in the existing self-declared style. It never replaces the researched range. It still caps an outrageous comparable, as now (four times the stated price, unless there is an appraisal).

### 9.3 A receipt updates the evidence

A receipt photo or PDF is read by Muse Spark 1.3 and matched to a line. That already works in Connections. When it matches, it sets price paid, purchase date, retailer, and model if listed. The line goes to tier 99, and the range collapses to the receipt-anchored replacement. The change is logged in `item_events`. The receipt file is stored in the private bucket. A receipt can be added at any time after the scan, and the line updates.

### 9.4 Research findings are a question for the owner

Decided on 2026-11-04. There is no background pass, and research does not write onto a line by itself. "Apply research automatically" is off by default. Research still runs in the page, from the first object with a stable identity (brand read, or seen in two clips), and again when a line's name changes. What it finds is held as a finding. The owner reviews each finding and approves it or adjusts it, using the same pattern as merging duplicates (section 11).

**Where it shows.** While paused, the camera overlay shows a question mark with a count, such as "3 findings to review", next to the repeats count. After Done, findings sit at the top of the list as "Research to review". Nothing interrupts filming.

**The sheet.** Tapping the question mark opens one finding at a time over the paused camera. Two cards sit side by side, stacked on a narrow phone:

| What the scan saw | What research found |
| --- | --- |
| Best still, lean name, brand evidence | Proposed name with brand and model ("Honeywell HYF290B tower fan") |
| What you said, with the declared-value chip | Replacement range ("$50 to $65"), basis Comparable or Exact |
| Clip and second | Up to three sources: retailer, product name, date checked |

When research has two possible models, both appear as options beside the scan card, and the owner picks one.

**The buttons:**

- **Use this**, the primary action. It applies the name, model, and range. The button flashes once (section 11's motion), and the card settles into the line.
- **Adjust** opens the same fields filled from the finding: name, model, and low and high. The owner changes what is wrong and saves. That is recorded as owner-adjusted research.
- **Not this item** discards the finding and remembers it, so the same match is not offered again. The line keeps no researched value and asks for a label photo or receipt.
- **Later** leaves it in the list.

**The toggle.** "Apply research automatically" is at the top of the sheet and in the list settings, and it is off by default. When it is on, a finding applies without asking only when it is an exact model match and its sources agree on the range. A strip shows "Applied 2 automatically · Undo". Every other finding is still asked.

**What the line shows before approval.** "Not priced yet · finding to review". The total counts approved values only, and says how many lines are waiting. A finding never changes the confidence tier on its own. Approving a comparable is the owner's agreement, not verification, so teal stays for verified.

**Saved, not lost.** Findings are stored on the inventory document as pending (`findings`, zod-validated), so a reload or a closed page does not lose them. Research that had not finished is queued again when the inventory opens.

**Logged.** Each approval, adjustment, and rejection is an `item_events` change with its source: research approved, research adjusted by the owner, or research rejected. The research call itself stays in `cost_ledger` as `price`.

**For the score.** The first score is identity, quantity, and inclusion. With automatic application off, the automatic output carries no researched names, and an approval is a manual edit taken after the score. Research cannot raise or lower the match score.

**Why.** In 1A, unbranded lines got exact-looking prices such as $514.07, and pricing took a median of 64.5 seconds per batch with one of four failing. Showing the finding as a question means a wrong comparable is caught by the person who owns the item, before it lands.

**Files:** `review-shape.ts` and `inventory-record.ts` (optional `replacementLowUsd`, `replacementHighUsd`, `sources`, and `findings`; old documents still load), `review-scan.ts` (price prompt asks for a range and up to two models), `Recorder.tsx` (question mark and sheet while paused), `ItemizedRooms.tsx` (findings to review, the range, the declared-value chip), `inventory.ts` (`replacementTotal` counts approved values, and a waiting count), and the claim file and CSV (both ends).

**Accepted when:** no line has a researched price until it is approved, unless the toggle is on and the match is exact. Harness: a finding leaves the line unpriced; "Use this" applies it and logs it; "Adjust" saves the owner's numbers; "Not this item" is not offered again; and with the toggle on, only an exact match with agreeing sources applies.

## 10. What is not personal property for this list

**Scope for this build:** the three labels in 10.1 and the immediate fixes below them: the trash can, the weight plates, the trinket dish, and groups of one. The policy profile (10.2), the double-run check (10.3), and the form research are after the demo. They carry legal weight, and they cannot be researched properly today.

The research covers how US personal property (contents) is treated on homeowner, renter, and condo policies. Before any rule is written, read the standard homeowners form's contents sections ("Property Not Covered" and "Special Limits of Liability") and the matching renter and condo forms. Read the NAIC home inventory guidance too. Each rule in code carries the form and section it came from. No dollar limit is written into the product without its source line.

### 10.1 Three outcomes, not two

| Outcome | Examples to verify against the forms | What the list does |
| --- | --- | --- |
| Not listed | Consumables in use (a drink, food), trash itself, loose paper, empty shipping boxes | Dropped, logged as a correct exclusion |
| Not contents | Motor vehicles, pets, and items that are part of the building (built-in appliances, ceiling fans, cabinets) | Moved to a "Not contents" section with the reason. Not in the contents total |
| Contents with a special limit | Jewelry, watches, firearms, silverware, cash, collectibles | Listed, with "Check your policy's limit for this kind". Never excluded |

100proof does not decide coverage. These are labels for the owner and the reviewer, and the policy decides.

### 10.2 Policy profile, the middle layer (after the demo)

Between the filter and the list sits a policy profile: owner (house), renter, or condo, chosen once per inventory with owner as the default. The profile changes which lines are "Not contents". For a renter, built-ins belong to the landlord; for a condo owner, some improvements are theirs. The profile also says which lines get a special-limit note. The filter decides what an object is, and the profile decides how it is labeled.

### 10.3 Double-run check (after the demo)

An object leaves the list only when two independent checks agree. The rules decide first, then Muse Spark 1.3 judges the line with its still and description. When they disagree, the line stays and becomes a pending decision for the reviewer. On a scored run, a pending decision withholds the score until it is resolved, so the person resolves it before scoring.

**Immediate fixes from 1A:** a trash can, a wastebasket, and a recycling bin are containers and are listed, while trash is not. Weight plates, bumper plates, a barbell, and a curl bar are gym equipment, not dinnerware. A decorative dish or trinket dish is decor, not a bulk dish line. A group of one is not a group.

**Accepted when:** the 1A trash can is listed and the gym equipment carries no bulk text. Harness for this build: one check per row of 10.1 and one per immediate fix. After the demo, add one per profile and a disagreement that becomes pending.

## 11. Merging duplicates: the screen

**While paused.** When consolidation has a pair it is unsure of, the camera overlay shows a small question mark with a count ("2 possible repeats"). Nothing interrupts filming. Tapping it opens a sheet over the paused camera.

**Side by side.** Two cards next to each other, stacked on a narrow phone. Each card has the best still, the lean name, the room, the clip and second, and the range. The buttons:

- **Same item**, the primary action. It keeps the line with more evidence and records what it absorbed. That rule is already in the harness.
- **Two items** keeps both and remembers the answer, so the pair is not asked again.
- **Not sure** leaves the pair for the review after Done.

**Merge repeats automatically**, a toggle at the top of the sheet and in the list settings. When it is on, every pair where the rules and the model agree merges without asking. A strip shows "Merged 3 automatically · Undo". When it is off, those pairs are asked too. Unsure pairs are always asked. The default is on.

**After Done,** the same pairs appear at the top of the list as "Possible repeats", with the same sheet.

**Motion and brand.** The confirmed button flashes once: a white overlay at 0 to 35 percent opacity, back to 0, over `--proof-duration-fast`. Then the absorbed card slides and fades into the kept card. Only transform and opacity move, and only `--proof-ease` is used. The gradient stays on the primary action only, and teal stays for verified. No flash with reduced motion. This is polish. It is built with the sheet and left out of the pitch.

**For the score:** automatic merges are part of the automatic output. The person's taps are manual edits, and the score is taken before them.

## 12. Same clips, re-scanned after every change

1A is now a fixed test case. Its 10 clips and transcripts are in the bucket, and the eval script runs the app's own pipeline on recorded clips (`docs/EVAL.md`).

1. **Export 1A to an eval case.** A script in `apps/worker` uses the service-role key, which is allowed only there. It downloads the clips and writes `apps/web/scripts/eval/cases/1a/`, which git ignores. The case carries each clip's saved transcript, so the listing can be re-run without transcribing again.
2. **Re-run after every change** to a prompt, the merge, the filter, or names. Score the output with `scoreRun`, and compare duplicates, misses, and extras with the previous run.
3. **Model variance on the same input.** Run the 1A case three times on one build. The spread between those three is the model's own variance, separate from walk variance.
4. **Gate:** a change is committed only if the 1A re-run's match score does not fall and its extras do not rise. The result goes in `docs/SCORECARD.md` under "Same-clip re-runs", with the build and prompt version.
5. **Cost:** each re-run is about 10 listing calls plus pricing and reconcile, all in `cost_ledger`. A re-run may skip pricing when the change cannot affect it.

## 13. Five walks, one rate (built)

The rule is in `scoreSeries` (`apps/web/lib/scorecard.ts`), committed in `d91bd1f` and checked by the harness. A series is five separate scored walks of this space on a stated build. The rate is the average match score in percent, to one decimal. It is computed on percentages, not fractions. The target is 95 on every run and on the average. Sample variance above 4 (2 points of standard deviation) marks the walks inconsistent. A pending or rejected run withholds the series. A sixth run starts a new series. 95 is not claimed until five agreeing runs show it.

Still to build: scoring a walk takes a person crediting each hand-list entry. A matcher should propose matches by name, brand, kind, and room, for the person to confirm. A small command should then read the confirmed runs and print the series. The runs file holds counts per entry id only, no media and no address.

1A was filmed before these fixes. Score it as the "before" run, not as Run 01 of the series.

## 14. Frontier upgrades

These raise the ceiling without putting the demo at risk. Read twice (14.1) is core: it is built right after the fixes and is on for the five scored walks. The others follow in the order in section 15.

### 14.1 Read twice: every item over $250 identified twice, disagreement shown, not guessed

This is the signature trust mechanism, and it is a headline capability, not an add-on. Every line that could be over $250 is identified twice, independently, before its identity counts. When the two reads agree, the line gets a clean confirmation. When they disagree, the line is flagged unsure and both candidate identities are shown. On the items that matter most, the system shows its own uncertainty instead of guessing.

**Which lines.** Any object whose seen estimate or research range reaches $250, the threshold the label stills already use. In 1A that is about 18 lines before duplicates are merged.

**Two reads, kept apart.** Two Muse Spark 1.3 calls run at the same time. Read A gets the best still and the owner's claims for that object. Read B gets a still from a different second or clip and the sighting description. Neither sees the other's answer or the line's current name. Each returns kind, brand, model or series, and the visible evidence for each, zod-validated. With only one sighting, Read B uses a still two seconds away.

**The comparison** is deterministic, on normalized kind, brand, and model:

| Result | Rule | The line shows |
| --- | --- | --- |
| Confirmed twice | Same kind and brand, and the same model or both unknown | "Read twice, same answer", in navy, not teal. When both reads lack a model, the model stays open |
| Unsure | Kind or brand differs, or the two models differ | The attention mark, "Two reads disagree", and both candidates. Identity is not settled |
| Read once | A call failed or timed out | "Read once". It is retried once and never counts as confirmed |

**The question.** Unsure lines join the question-mark count on the paused camera, and "To review" after Done, in the same sheet as merges (section 11). The still sits in the middle and the two candidates sit side by side. Each candidate shows its name, the evidence its read cited, and its research range once research has run (9.4). For example, one card says "read VIZIO on the bezel" and the other says "shape only, likely TCL". The buttons are "This one" on each card, "Neither" (edit the name), and "Snap the label". A label photo settles it with the label reading that exists today. The owner's choice is a manual edit.

**Honest about what it proves.** Two reads by one model of two views are not independent proof. Agreement removes one kind of error: a guess that would change with the view. It does not verify the item. A confirmation never turns teal and never raises the tier above what the evidence gives. Disagreement lowers it: an unsure line cannot sit at 90 or 95 until it is resolved.

**Measured, not asserted.** Each inventory's Measures shows how many high-value lines were read twice, how many agreed, and how many disagreed. On the scored walks, the hand list's brands (Vizio, Honeywell, Marshall, eero, Bowflex, Fitness Gear, Peloton, TISSCARE, OOFOS, Crocs) let us check two things. Were the lines confirmed twice right? Would the lines flagged unsure have been wrong on a single read? That is the evidence that its doubt is well placed. The results go in `docs/SCORECARD.md` under "Read twice". Nothing is claimed before the walks.

**Cost and time.** Two calls per qualifying line, logged as `identity` in `cost_ledger`, running alongside filming. A line is read twice once, and again only when a later clip changes its identity.

**What it feeds.** The proof ledger (14.2): a line over $250 counts as identified only when its two reads agree, or a receipt or label settles it. Research (9.4): an unsure line's finding shows a range for each candidate.

**Files:** `review-scan.ts` (identity prompt and the two calls), `scan-pipeline.ts` (compare and apply), `review-shape.ts` and `inventory-record.ts` (`identityReads`, two entries; `identityCheck`: confirmed, unsure, or single), `line-confidence.ts` (unsure caps the tier), `Recorder.tsx` and `ItemizedRooms.tsx` (the mark and the sheet), and a route at `/api/scan/identity`. The prompt change carries `Meta-Models: Muse Spark 1.3`.

**Accepted when:** the harness shows that matching answers confirm. A different brand is unsure, with both candidates kept. Two unknown models confirm the brand and leave the model open. A failed read never confirms. Unsure caps the tier below 90. A label resolves unsure. A confirmation never sets verified. On the 1A re-run, every line of $250 or more has two reads and a result.

### 14.2 Proof ledger: how much of your inventory total is proven

The total is split into four bands. Each line is in exactly one.

| Band | A line is here when |
| --- | --- |
| Receipt confirmed | A receipt or a formal appraisal matches it (tier 99) |
| Seen and identified | Seen on camera, with the count settled and the identity settled: a brand read or said, with a model. Over $250, it also needs two reads that agree (14.1) |
| Seen and estimated | Seen on camera, with the identity or the count open. Every unsure line is here |
| Stated, not seen | Entered from what the owner said |

The headline is "Of your $10,000, $X is proven." Here, proven means the top two bands. It is not a promise of payment, and the screen says so. The bands follow the same rules as `replacementTotal`, so hidden lines are left out. Once ranges land (9.1), each band is a range. The ledger appears at the top of the list and in the summary. The claim file gets a `ledger` block, and the CSV gets an `evidence_band` column.

**Accepted when:** the bands add up to the total. An unsure line is never in Seen and identified. A stated line is never in a seen band.

### 14.3 Tap to replay: every line plays the seconds it was filmed

Tap any line and its clip plays from one second before its best second, for about three seconds. The narration from those seconds is captioned underneath, and the other sightings are listed ("also seen in clip 6 at 0:14"). For a "Stated, not seen" line, it plays where it was said. For a line read twice, it shows both stills that were read. It uses what is already stored: the clip's `storagePath`, the line's `seenAt` seconds, and the clip's timed `spoken` lines. Media is served through expiring signed links from the private bucket.

**Accepted when:** no public media URL exists, captions fall inside the played seconds, and stated lines play where they were said.

### 14.4 Before-and-after walk: a second video walk matched item by item

A "Scan more" walk of a saved inventory is matched object by object to the first walk, with the consolidation in 5.2. Each saved object is marked: seen again, moved (seen in another room), condition changed (damage now that was not seen before), or not seen in this walk. Objects found only on the second walk are new. Only rooms the second walk entered are compared, using the room markers. An object in a room that was not entered is "Not checked", never "not seen". The list never says missing or stolen.

**Demo,** labeled honestly: the Marshall radio has to be listed on the first walk, and 1A did not list it. Remove it before a short scan-more walk of that bedroom, and show "Not seen since November 4". A label on screen says it was removed on purpose for the demo. This runs only on a scan-more walk in this build.

**Accepted when:** a removed object reads "Not seen since …". A room that was not entered reads "Not checked". A moved object is seen again and moved, not new.

### 14.5 What-belongs-here prompts: reminders for commonly forgotten items

On pause, once per room, Muse Spark 1.3 gets the room name and its listed objects as text. It returns up to three things a room like that usually has that are not listed. Each is a question with a reason, such as "A TV and console are listed. Is there a router or streaming box near them?" or "Are there blankets in the hall closet?" The owner films it, says it, or taps "Not here", and that answer is remembered. It is a prompt, never a completeness claim: no screen says everything was found. The suggestion is data, zod-validated, at most three per room, and with no brand.

For the score, a prompt changes the walk. Each scored run states whether prompts were on, and the five runs in a series use the same setting. 1A missed the router, the surge protector, and the blankets, so this is aimed at a real miss.

### 14.6 How the plan is pitched

- Read twice is a headline capability. It goes first in the feature list and gets its own demo beat.
- A price range is honest uncertainty that feeds the proof ledger. It is not pitched alone.
- Room chips are a fix, not an innovation. They are built and not pitched.
- The button flash and thumbnail sharpness are left out of the story. Stills are after the demo.
- The policy profile is reduced to the three labels, plus the trash can and weight-plate fixes, for this build.
- The engine is pitched as one sentence: Muse Spark 1.3 used five different ways, each with a typed contract.

### 14.7 Demo flow for these capabilities

This is the order for the technical-depth part of the video. A beat goes into `docs/DEMO_SCRIPT.md` only after it is built and shown working on the day, because that script lists only what the build does.

1. **Read twice.** The paused camera shows "1 to review". Open it: two reads of one high-value line, side by side, and the choice. If every read agreed on that walk, show the Measures line instead ("12 read twice, 12 agreed") and say so. Line: "On anything over $250, it looks twice. When it disagrees with itself, it tells me instead of guessing."
2. **Proof ledger.** The total in four bands. Line: "Of about $X, this much is proven by what the camera read or a receipt."
3. **Tap to replay.** Tap the antique telephone. It plays the seconds where it was said, with the caption, marked "Stated, not seen".
4. **Before-and-after walk.** The scan-more walk after removing the radio shows "Not seen since November 4", with the on-screen label.

## 15. Order of work

**Before the five scored walks (today)**, because these change the score:

1. Room chips and the seed list, with "Walkthrough" removed (section 4). Built on 2026-11-04, not committed. A likely room change with no tap is asked on the camera, and nothing moves until the person says yes. Clips in the video list are named by the rooms tapped in them.
2. The name sanitizer, and `knownSoFar` as records (section 8, 5.2). The sanitizer is built: room prefixes and placeholder words are stripped from new lines and from saved lines when they load. `knownSoFar` as records is still open.
3. Cross-room pairing with the rules and model confirm (5.2). Built on 2026-11-04, not committed. Identity rules run after every clip and at Done: strong matches merge, weaker ones are asked with Muse Spark 1.3's photo comparison shown as advice. A Scan more walk is matched against the saved lines. Still open: measuring on scored walks how often the photo verdict agrees with the owner's answer.
4. Filter fixes: trash can, gym plates, trinket dish, groups of one (10).
5. Transcript stitching across clip boundaries (7.1).
6. Glance off for real.
7. Export 1A, re-run it, and score before and after (12).

**Then, the core, also before the scored walks:** read twice (14.1). Built on 2026-11-04, not committed. It is on for all five walks, so the series also measures whether its doubt is well placed.

**Then:** the proof ledger (14.2) and tap to replay (14.3). After those, the before-and-after walk (14.4), only on a scan-more walk. All three built on 2026-11-04, not committed; what-belongs-here prompts (14.5) built the same day. The CSV `evidence_band` column, the `belongs` call type, and the scorecard's Reminders checkbox (`remindersOn` on each run; a series cannot mix settings) are built.

**Next:** the merge sheet and auto-merge toggle (11), research findings as a question with the toggle off (9.4), ranges and the declared-value chip (9.1, 9.2), pre-filled fields (7.4), claims before pictures (7.2), and the brand evidence ladder (6).

**After the demo, unless time allows:** what-belongs-here prompts (14.5). After the demo: the policy profile and double-run filter from the form research (10), the strategic stills (16), the matcher (13), and the discoverability roadmap (18).

## 16. Thumbnails: the best still per line

After the demo. This is polish, and it is left out of the pitch.

Today the line keeps the clearest second the model named, and two lines that share a second drop it. The plan:

1. The sighting names its best second. The phone already keeps one still per second.
2. Among the stills within one second of it, keep the sharpest. Sharpness is measured on the phone with a small edge-contrast check on a downscaled copy.
3. For a branded line, prefer the still where the brand was read.
4. Cropping to the object needs a region. Muse Spark 1.3 returns no coordinates in today's prompts. Test whether it can return one reliably, zod-validated, before cropping. Until then, the full frame is used.
5. While paused, "Snap" takes a hero still for any line. That replaces the thumbnail and is a manual edit.

## 17. Docs updated with each change

`CHANGELOG.md`, `docs/BUILT_DURING_HACKATHON.md`, and `docs/SCORECARD.md` (re-runs, series, and read twice) change in the same commit. `legal/DATA_INVENTORY.md` changes for claims, room markers, research findings, and receipts fields. ADR 0010 records that this build runs model stages in the page, without Inngest. `docs/HOT_QUERIES.md` gets any new query. Any prompt change carries `Meta-Models: Muse Spark 1.3`.

## 18. Post-launch roadmap: distribution, search, and LLM findability

None of this is needed for the demo or the five scored walks. It is tracked here and planned for after launch. Every item keeps the rules already in force: no accuracy claim before a series exists, no statistic without its source on the same page, the models named by version, and no claim that 100proof decides coverage.

**The feature list, in this order, with the same names everywhere:**

1. **Read twice: every item over $250 identified twice, disagreement shown, not guessed.** The headline capability (14.1).
2. **Proof ledger: how much of your inventory total is proven** (14.2).
3. **Before-and-after walk: a second video walk matched item by item** (14.4).
4. **Tap to replay: every line plays the seconds it was filmed** (14.3).
5. **What-belongs-here prompts: reminders for commonly forgotten items** (14.5).
6. **Research you approve: price findings shown as a question, never applied silently** (9.4).

**Tracked work:**

| # | Item | What it is | Where |
| --- | --- | --- | --- |
| 1 | One name per capability | Use the six names above, word for word, in the app, the Information page, `README.md`, the demo video chapters, and these docs | Copy across the repo |
| 2 | Searchable titles and descriptions | Rewrite section titles and one-sentence descriptions as plain answers to what people search, such as how to make a home inventory for insurance from a video, or how to show what you owned after a fire. No technical meaning changes | Information page, `README.md`, docs |
| 3 | One Information entry per capability | A question and a short answer for each of the six, with FAQ markup. The page already carries FAQ markup and allows answer bots | `apps/web` Information page |
| 4 | A plain facts file for LLMs | A short text file at the site root that says what 100proof does and does not do. It names the two models by version, states the limits, and links the method docs, so an assistant citing it gets the facts right | `/llms.txt`, linked from the footer |
| 5 | Citable method pages | Public versions of the scorecard method, the five-run rule, and read twice, each with its date and build. Results are added only after a series is recorded | Information page or a method page |
| 6 | Demo video chapters | Chapter titles that use the capability names, so each part can be found and shared on its own | Video description |
| 7 | Short capability clips | One clip of each capability, under 30 seconds, from real walks of the hand-listed space, labeled as such | Social and the providers page |
| 8 | Providers page copy | One line per capability for adjusters, appraisers, and agents, with what it does and does not decide | `/?for=providers` |
| 9 | Measurement | Search and referral measurement only behind `ConsentGate`, loaded after the page is interactive, per `docs/ENGINEERING_STANDARDS.md` §2 | `apps/web` |

## 19. Decisions for Steven

1. Auto-merge default: on for pairs where the rules and the model agree, as planned, or off.
2. Research: decided on 2026-11-04. No background pass. "Apply research automatically" is off by default. Findings are shown in the page as a question, with the question mark, a pause, and side-by-side options, for the owner to approve or adjust (9.4). No Inngest.
3. The default policy profile: owner (house).
4. Score 1A as the "before" run.
5. Room chips: decided on 2026-11-04. The camera shows the four demo starters (Front entrance, Primary bedroom, Hallway, Gym) plus "More", which opens the rest of the seed list and "Add a room" (section 4).
