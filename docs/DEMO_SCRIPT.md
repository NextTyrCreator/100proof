# Demo video: spoken script, timed

About 410 words at 150 wpm fills 2:45 inside 3:00. The fire open and the hold on the record hash are silent. Talking points, not a read. Bracketed text is a direction or a number to fill in from the scored run, not spoken.

Every claim in this script is true of the build on `main` as of 2026-11-04. Two Meta models run in the product: Muse Spark 1.3 and Muse Voice Transcribe 1.0. Nothing else is named. The numbers in brackets come from Run 01 against the scorecard baseline (`docs/SCORECARD.md`) and are filled in after that run, not before. If a beat cannot be shown on screen on the day, cut the beat; do not keep the claim.

The space is the one inventoried by hand on 2026-11-03: front entrance, bedroom 1, hallway, gym. 40 entries, 60 units. Those are the objects the camera sees. No other room is in the video.

## How the judges score, and where each beat lands

From `docs/GTM.md`, checked against the event page on 2026-10-28: Impact 30%, Meta AI tooling 25%, Demo 25%, Technical depth 20%. The theme is Build for Your World. Judges score the finished project. Large hackathons are won by one loop a judge can follow, a problem with a source, and an honest limit.

| Beat | Criterion it serves |
| --- | --- |
| 0:00 to 0:34 the problem, said plainly, with the source on the frame | Impact |
| 0:34 to 1:36 one walk, four rooms, two models doing visible work | Meta tooling, Demo |
| 1:36 to 2:20 confidence per line, receipt after the fact, sealed record | Technical depth |
| 2:20 to 2:48 scored against a hand inventory, number and misses on screen | Technical depth, honest limit |
| 2:48 close | Impact |

## Script

**[0:00] Fire footage, then on you, low light. Silent until 0:06.**
"I can't believe this is happening." [beat] "And the first thing they'll ask me is: what did you own?"

**[0:12] Daylight, to lens.**
"Nobody thinks it will be them. Then it is, and it's too late to make the list. A contents claim is paid against a list, one item at a time. The NAIC already tells people to film their rooms. Almost nobody does, because turning a video into an itemized, priced list was hours of work. And a value you declare from memory is often not the value you're paid." [If a statistic is on the frame, its source is on the same frame. No source, no number.]

**[0:28]**
"I'm Steven Blackburn. This is 100proof. Everything you're about to see was built in the last ten days on Meta's models. Here's the whole thing."

**[0:34] Screen: email code, My inventory first visit, the four steps, "Begin your first inventory now!"**
"You sign in with a code. You press Begin. You film one walk and talk as you go. That's the entire form."

**[0:44] Screen: phone, filming. Front entrance: entry table, the plants in their vases, the five decor pieces, OOFOS sandals, camouflage Crocs.**
"Thirty-second clips. Each clip goes to Muse Spark 1.3 together with what I said, transcribed by Muse Voice Transcribe 1.0. It lists what is there. Not a caption. A count, per room." [over the entrance] "Five decor pieces, five lines. Two pairs of shoes. The Crocs show no logo, so it says likely Crocs from the shape, and it marks that as a lead, not a fact."

**[1:02] Screen: bedroom. Close-up one: the Vizio badge. Close-up two: the Marshall radio.**
"A brand I can read on camera identifies that object. Vizio, on the TV. Marshall, on the radio. The close-up belongs to the thing it's on, and nothing else in the frame borrows it. That is what moves a line from an estimate to an identified item."

**[1:14] Still in the bedroom. Hand on the dresser, drawer closed. Say to camera: "There's an antique telephone in this dresser, and the drawers are my clothes."**
"You don't have to open every drawer. Say what's in it. It goes on the list from your words, marked stated, not seen, at a lower confidence. Nothing is dropped and nothing is guessed. An appraiser opens the file and sees in one glance which lines are solid and which ones to check." [If the spoken telephone line does not appear in the run, cut this beat.]

**[1:26] Screen: gym. Close-up three: the Peloton. Then the Bowflex dumbbells, the bench, the rack, the 185 lb plates.**
"Peloton. Bowflex. Fitness Gear. Two dumbbells are two units. The plates are one lot until the count is known. Those are the counting rules from the hand inventory, and the scan is held to the same rules."

**[1:36] Screen: Done. My inventory shows the card with "Scan will be completed soon."**
"Press Done. The list is saved while I walk away. [number] minutes of filming for four rooms." [Use the filmed minutes from the run. Do not say ninety seconds.]

**[1:44] Screen: the inventory. Open the Peloton line, then the TV, then a line marked "needs a receipt".**
"Every line says how sure it is, and why. A model number read on camera is ninety-five. A model name with its brand is ninety. One similar model is seventy-five, and that is the floor for a line we stand behind. A receipt is ninety-nine. When two versions could both fit, it does not pick the expensive one. It waits, and it tells you what would settle it: the receipt, or a photo of the label."

**[2:02] Screen: a line with amount paid, replacement cost, and actual cash value side by side. Then Connections: a receipt photo matched to a line, turning it Receipt verified.**
"Replacement cost and actual cash value, side by side, because that is how a claim is settled. Tell it what you paid and the comparable cannot run away from that number. Weeks later, you can still take a picture of a receipt. It reads it, matches the line, and that line goes to ninety-nine. Whatever is estimated says estimated."

**[2:18] Screen: Download. The proof text with the record hash. Hold on the hash for two seconds.**
"When you are done, the record is sealed with a SHA-256 hash and dated. Download it. Send it to your carrier. Every line keeps the clip and the second it came from. 100proof does not decide coverage. It gives the carrier a list it can check, and it gives you the list before you need it."

**[2:32] Screen: `docs/SCORECARD.md`, the baseline table, then Run 01.**
"How do we know it is right? We inventoried this space by hand first. Forty entries, sixty units. Then we scored the scan against it, one unit at a time, before any edit. Run one: [TP] of sixty captured, [FP] extra, match score [N] percent. The misses are listed by name. That number is in the repo, with every run after it."

**[2:48] To lens.**
"Every insurer already asks for this list. Now it comes from a walk, with its proof attached, and it is yours before anything happens. 100proof. The repo and the demo are in the description."

**[2:57] End card, silent.**

## Why the drawer beat is written this way

The system does not require the owner to expose everything. What is on camera with a readable brand is identified. What the owner names while it is out of view is listed from their words, marked "Stated, not seen", with identity unsettled and a lower confidence. The appraiser then knows which lines to look at. That is the product's position: list everything the owner can show or say, grade each line by the evidence behind it, and never pretend a closed drawer was seen. The listing prompt carries that rule (`apps/web/lib/review-scan.ts`, "An object the person names while it is out of view").

On the scorecard, a spoken telephone line counts as included if the automatic output lists it. A line that is neither seen nor said is a miss.

## What was removed from the earlier storyboard, and why

| Earlier line | Status in the build | What the script says instead |
| --- | --- | --- |
| SAM 3.1 finds and tracks every object; masks on screen | Not built. The model returns no coordinates, so no masks or boxes are drawn. | Muse Spark 1.3 lists each clip with the transcript. Thumbnails are the clearest frame, labeled with the line name. |
| Coverage meter; hangers counting up; "tells you when it's seen them all" | Not built. | Count per room. Nothing claims completeness. |
| Question deck during the walk | Asks show only when paused; the live scanner is off for the demo. | The line says what would settle it: receipt or label photo. |
| Gmail connect, read-only; a Muse Wonder agent reconciles receipts | No email connection. Muse Wonder is not called anywhere in the app. | Connections accepts a receipt photo or PDF and matches it to a line. |
| Receipt parsing on Muse Spark Open through Baseten | Baseten was excluded on day one (ADR 0005). Receipts are read by Muse Spark 1.3. | Named correctly. |
| Contents $84k vs coverage $60k; jewelry against a theft limit; "schedule it" | No coverage comparison exists. Jewelry is excluded from the study. | Replacement cost and actual cash value, amount paid, confidence. |
| Combine into a versioned Master; send a link; carrier presses Verify and sees the frame | No Master, no link, no Verify page. There is a sealed record hash, a download, and share/mail of the proof text. | Hash, date, download, clip and second per line. |
| Rescan and a Muse Wonder agent drafts the proof of loss | Not built. | Cut. |
| Four Meta models; about $1.40 a scan | Two models. Test 5 (11.1 filmed minutes, whole house) cost about $2.50 by Steven's count. | Two models named. Cost stated only if shown from `cost_ledger` on screen. |
| Recall on staged rooms is on the README | No scored run existed. The rooms are the house as it stands, not staged. | Run 01 against the hand baseline, filled in after the run. |
| 53% of homeowners; 75 to 80% of limits; $3 to 7 billion | No source in the repository. | Said without numbers, or shown with the source on the frame. |
| "It was never a ninety-second job. Now it is." | A walk of four rooms is minutes, not seconds. | The filmed minutes from the run. |
| Built for the EU | The region field accepts eu; nothing EU-specific is built. | Cut. |
| "If I don't open the drawer, it's a miss on our side" | Wrong framing. The owner can say what is in a drawer and it is listed from their words. | The drawer beat above. |

## On the models, for the judges

The honest strength is depth, not count. Muse Spark 1.3 does five different jobs in one pipeline: lists each clip from video plus transcript, reads label close-ups, prices lines by web search, reconciles repeats and fills brand, model, serial, and color at Done, and reads receipts. Muse Voice Transcribe 1.0 turns narration into facts with clip times, which is what makes the drawer beat work. Every call, including failures, is in `cost_ledger` with latency and bytes. Say that. Do not add a third model today for the sake of the count; a judge can tell a model that is doing work from one that is named.

## The run before recording

1. Film the four rooms once. Label close-ups on the Vizio, the Marshall, and the Peloton. At the dresser, say the telephone and the clothes out loud with the drawer closed.
2. Score the automatic output against the baseline with `scoreRun` (`apps/web/lib/scorecard.ts`) and write Run 01 into `docs/SCORECARD.md`. A spoken line counts as included if it is on the automatic output.
3. Put the four bracketed numbers into this script. If the match score is low, the script still works: say the number and the misses. Honest beats round.
