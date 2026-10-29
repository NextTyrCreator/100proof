# Scan plan: speed, identification, connections, and the list

Date: 2026-10-29 · Owner: Steven Blackburn · Status: phase 1 built and checked by the harness, not yet phone-tested; phase 2 planned · ADR 0010

This plan answers one phone test: an 11-clip walkthrough of a house, a patio, and a hot tub. It took too long, timed out, repeated items, and asked for labels on things the camera had already shown clearly. Every number below comes from that test's `cost_ledger` rows and the dev server log. No user content is copied here.

## 1. What the test showed

### Speed

| Step per 30-second clip | Median | 90th percentile | Runs |
| --- | --- | --- | --- |
| Listing (Muse Spark 1.3, video) | 38.4 s | 42.1 s | after the upload |
| Pricing (Muse Spark 1.3, web search) | 19.3 s | 27.7 s | after the listing |
| Narration (Muse Voice Transcribe 1.0) | 5.3 s | 6.3 s | alongside the upload |
| Whole request, seen by the server | 49–88 s | — | one clip at a time |

- **Each clip took about 60 seconds to review, and a new one arrived every 30 seconds.** The queue fell further behind with every clip. Eleven clips took 1,136 seconds from the first call to the last (19 minutes) for about 5.5 minutes of filming.
- **Pricing sat on the critical path.** About 35% of each request was the price search. That search could run alongside the next clip.
- **Six requests returned 502 after 48–63 seconds.** Each time, the same clip failed twice and then passed on the third try. That timing matches a listing call that ran to its token limit and came back `incomplete`, which the route turns into a 502. The failures were not in the ledger because calls were recorded only on success, so the measures panel showed zero failures.
- **The longest request (88 s) was close to Cloudflare's 100-second limit.** A quick tunnel cuts a response at 100 seconds with a 524, so any slower clip would fail on the phone even though the server finished.
- **Speaker tags leaked into transcripts.** Text like `<|speaker_A|>` from the transcription service went to the listing call and was saved on lines.

### What came back

The inventory had about 90 lines. The ones that matter:

- **The same object listed twice from different clips.** The hot tub appeared as "Master Spas Hot Tub, Clarity, $8,660" and again as "Portable hot tub spa, $487," priced as an inflatable. The grill was "Mont Alpi, $5,574" and "Built-in stainless gas grill, $648." The sectional appeared as three lines, and the TV, phone, and daybed each appeared as two. One walkthrough produced five outdoor room titles. Each clip is listed without knowing what earlier clips found, and the merge only joins lines with exactly the same name.
- **A spoken price paid was lost.** "Bought it for 250" (an antique silver planter) and "$800 table… table and six chairs for $1,500" stayed in the narration text, so the antique was priced as a $9.73 planter. The listing has no field for a spoken price.
- **A spoken year was not used.** "2021 is the year I bought it" became the age text "5" but not an age in years, so no depreciation was taken.
- **Label requests on large items that were filmed clearly.** The hot tub, grill, sectional, and basketball hoop each asked for a label. When the model had no request of its own, the app added one, and any unsettled model became a label request, whatever the item was.
- **What went right.** The Master Spas brand and Clarity series came from the narration about the cover. The Google Pixel 10 Pro, Bowflex SelectTech 552, and GCI Freestyle Rocker XL were priced as exact products. The Ashley and Patio Joy brands came from speech.

## 2. Phase 1 (this build)

### 2.1 Pipeline: faster than filming, and no lost clips

1. **Separate listing from pricing.** `/api/scan/review` lists one clip and returns. `/api/scan/price` prices only new lines, in batches of up to 30, running while the next clip is listed. Lines with the same description are priced once. Expected per-clip request: about 40–45 seconds, well under the tunnel's 100 seconds.
2. **Two clips in flight.** At about 40 seconds per clip with two at once, review keeps pace with 30-second filming. Results are applied in clip order, so the list is the same as a one-at-a-time run.
3. **Retry automatically.** A failed clip is retried twice, with a short pause, before the Retry button appears.
4. **Shorter output and more room.** The listing leaves out empty fields instead of writing nulls, which cuts output by a large share, and its output limit goes from 8,000 to 16,000 tokens. An `incomplete` answer that has complete rooms is kept up to its last complete item instead of being thrown away.
5. **Record every call, including failures.** Failed calls go to the ledger with `ok = false`, and the server logs a reason code (`incomplete`, `timeout`, `upstream`, `parse`) with no content. The measures panel then shows the real failure rate.
6. **Ten minutes per scan.** Sessions are up to 10 minutes (20 clips). "Scan more" on a saved inventory adds up to another 5 minutes.
7. **Clean transcripts.** Speaker tags are removed before anything uses the text.

Target for a 10-minute scan: the last line is listed within about 60 seconds of Done, and prices within about 90 seconds. The harness checks the clip queue, the salvage, the tag stripping, and the 10-minute clock. The live latency check is in `docs/EVAL.md`.

### 2.2 One object, one line

1. **Each listing call is told what is already listed.** It gets the room titles and the line names so far, as data, and is told to reuse a room title and a line name when it sees the same object again.
2. **A text-only reconcile when the scan finishes.** `/api/scan/reconcile` sends Muse Spark 1.3 the lines (room, name, brand, kind, clip, and time; no media) and gets back groups of lines that are the same physical object, plus room titles to combine. The app applies the result only within strict limits:
   - Lines are combined only when they are in the same category.
   - Two lines from the same single clip are never combined, because that clip was already listed as distinct objects.
   - Two different serials are never combined.
   - The line with the strongest evidence is kept (settled identity, brand, model, an exact price, a receipt, more sightings). It receives the other line's sightings, quotes, price paid, and age. The count is the larger of the two, not the sum.
   - Each combination is recorded in the line's change log.

### 2.3 Identify from the video, and ask less

1. **The video is enough for a confident estimate.** For large and fixed items (furniture, appliances, hot tubs, grills, play equipment), an unread model is priced from what the camera shows: the size, the shape, the class, and any brand that was read or spoken. When two models are about equally likely, the higher one is used, labeled "Comparable." No label request is raised. The line shows **Estimated from video** and offers **Use this estimate**, which records that you accepted it.
2. **Label requests only where a label actually matters.** A label request is raised only when the model asked for one, the item is not large or fixed, and the likely models differ by more than 40% of the price.
3. **Narration carries price paid, year, brand, and serial.** The listing returns `pricePaidUsd` when a price is stated for that one line. It is stored as "Price paid · from you" and is never treated as a receipt. A year or "N years old" becomes an age in years, from the listing or, if the model missed it, from the age text and the narration. Depreciation then uses the model's useful life, or a category default when the model gave none. Serials and brands come only from what was read or spoken.
4. **Antiques and collectibles are priced as antiques and collectibles,** not as new ordinary goods.

### 2.4 Receipt verified means a receipt

A price you type or say is **From you**. Only a receipt image, whether a photo on the line or a file matched through Connections, makes a line **Receipt verified** (teal). The accuracy mark changes the same way.

### 2.5 The live scanner

While the camera screen is visible and recording, a small frame (about 384 px) is sent to Muse Spark 1.3 at most every 4 seconds, and only when the view has changed. The answer is up to four object names, zod-checked, shown as a quiet "In view" line with a thin scanning sweep. It stops when the tab is hidden or paused. It costs at most 150 small calls per 10-minute scan and is capped per account per day. These glances are display only. They never become lines, because the listing call sees the full video.

### 2.6 The list

- Each room is a collapsible section with its line count and total.
- Each line is one collapsed row: a picture, the name and count, an evidence chip, and the line total. The picture is your photo if there is one, otherwise the frame from the clip at the moment the item was clearest. That frame is cut on the phone from the kept clip, so nothing new is stored or sent.
- Open a line to see:
  - Pictures, plus "Add photo."
  - Replacement, cash value, and your price paid, marked as from you.
  - "Add receipt," which reads the receipt and verifies the line.
  - A description.
  - "Talk about it": up to 30 seconds of voice, transcribed by Muse Voice Transcribe 1.0 and applied like a typed answer.
  - "Use this estimate."
  - Evidence and changes.
- "Scan more" opens another clip of up to 5 minutes on the same inventory.
- The layout is mobile-first, with tap targets of at least 44 px.

### 2.7 Connections (first working piece)

A **Connections** page in the navigation.

- **Files on this device (working).** Choose receipts, invoices, or quotes: pictures or PDFs up to 8 MB, or on a computer a whole folder (up to 30 files at a time, read one at a time). Each file is read by Muse Spark 1.3, and its line items are matched to the inventory's lines. You see each proposed match, including the store, date, and amount, and apply it. Applying a match uploads the file to the private evidence bucket, sets the price paid and the age from the purchase date, settles the identity when the receipt names the model, and marks the line **Receipt verified**. Nothing is applied without your tap. PDF reading through the Meta API has not been tried yet. A file that is read but not applied is not stored.
- **Email (planned).** Read-only Gmail or Outlook search for order confirmations from stores matching the inventory's brands. Only the matched message is kept, as evidence. Needs OAuth app review, so it is not in the hackathon build.
- **Your assistant via MCP (planned).** A read-only MCP tool, `find_receipts`, that a person's own agent can call against their files and send back matches into the same review screen.

### 2.8 Cost

- **Listing:** one call per clip, as before.
- **Pricing:** fewer calls than before, because lines repeated across clips are priced once and the reconcile happens before the last pricing.
- **Reconcile:** one text call per scan.
- **Glance:** at most 150 small image calls per 10-minute scan.
- **Voice notes:** $3 per 1,000 audio minutes.
- **Per-account daily caps:** 8 scans, 80 clips, 120 price batches, 10 reconciles, 600 glances, 30 evidence checks, 40 voice notes, and 60 connected files.

### 2.9 Condition, damage, likely brand, and the category check

Each clip's listing now returns three more things per line, so they appear while filming, not at the end.

1. **Condition.** One of new, good, fair, worn, or damaged.
2. **Damage.** A short note, a severity, and the second where it is clearest:
   - **minor:** cosmetic, such as a scuff, a light scratch, or a small stain;
   - **moderate:** visible and lowers use or looks, such as a crack, a tear, a dent, a missing knob, or a deep stain;
   - **severe:** broken or not usable.

   Glare, reflections, shadows, blur, dust, and clutter are not damage. When the model cannot tell, it asks a question instead.
3. **Likely brand.** Filled only when no brand was read or spoken. It comes with the clues behind it: part of a logo, a signature design, or a matching piece already listed.

**Damage is priced into worth today, not replacement.** Replacement cost is the price of a new item of like kind and quality, so damage never lowers it. Damage lowers actual cash value. After the age and condition share, the share left is multiplied by:

| Severity | Share kept |
| --- | --- |
| Minor | 90% |
| Moderate | 70% |
| Severe | 40% |

The 20% wear floor still applies. When there is no age, only the damage is deducted. The note on the line says how much the damage took off.

**Merging.** When the same object is seen again, the worse damage and condition are kept, the cash value is recomputed, and the change is logged.

**A brand from a label or receipt clears the likely brand.**

**Corrections.** A photo or an answer can set the condition, add damage, or clear it with `noDamage`. The route sends the line's category, condition, and damage so a correction is applied to the right line.

**Brand accuracy in pricing.**

- The price batch gets the likely brand as a lead. It is searched first, priced as **Comparable**, and said to be a likely brand; if that fails, the item's class is priced instead.
- Each comparable is checked against the line's kind, size, material, features, and brand, and the basis says when only the class matches.
- "Exact:" is downgraded to "Comparable:" in code unless the identity is settled and a brand or model is on the line.

**The category check.** The reconcile at Done now runs for every scan, including a single clip. Besides repeats and room titles, it returns category fixes, chosen by what the object is rather than the room it is in. A fix is applied only to a listed category, and it is logged with the source "check." The cash value is recomputed on that kind's useful life.

A line under $100 that is grouped with others does not keep one piece's damage note, and that damage is not taken off the group price. The group is marked worn instead.

A likely brand never marks the model as settled. "Undamaged" and "not new" are not read as damaged or new. When the same object is joined, an age or a worse condition from the other clip recomputes the cash value. The useful life used for that cash value is kept on the line, so a later damage note does not switch the schedule.

**Invariants (set version 2).**

| Check | Level | Raised when |
| --- | --- | --- |
| `damage-not-in-cash-value` | Blocker | A line has damage but its cash value is not below replacement. |
| `damaged-without-note` | Review | The condition is damaged but there is no damage note. |
| `exact-without-identity` | Review | The basis is "Exact:" but the identity is not settled. |
| `likely-brand-settled` | Review | A likely brand is on a line whose identity is settled. |
| `unknown-category` | Note | The category is not on the list. |

The claim file's schema version is now 2. Its lines carry `likelyBrand` (with `confirmed: false`), `condition`, and `damage` (with the clip number and second). The CSV adds `condition`, `damage`, and `likely_brand`.

## 3. Phase 2 (after the hackathon)

1. Move listing, pricing, and reconcile to Inngest with per-user concurrency, and push results to the page. This retires the ADR 0009 and ADR 0010 exceptions.
2. Email connections with read-only OAuth, and the MCP `find_receipts` tool.
3. On-device object detection for the live scanner, so glances cost nothing.
4. A reasoning-effort experiment (H-003 in `docs/EXPERIMENTS.md`): low against medium for listing, scored by `scripts/eval/run.ts`, to see whether medium is worth about 15 seconds per clip.
5. A frame per line saved at review time, so a line keeps its picture when the clip is deleted.

## 4. How we will know it worked

- On the same 11-clip walkthrough: the last line is listed within 60 seconds of Done; the ledger shows zero failed clips after retries; the hot tub, grill, sectional, TV, phone, and daybed each appear once; the outdoor rooms are one or two titles; the antique shows $250 from you; and the 2021 sectional shows about five years of depreciation.
- The harness passes the new checks: clip queue order, salvage, tag stripping, year parsing, label-request rules, the reconcile limits, price application, and receipt-only verification.
- The harness passes the condition checks: the damage share, damage with no age, replacement unchanged by damage, a later clip's damage lowering cash value, dropping a likely brand that has no clues, the "Exact:" downgrade, category fixes limited to the list, and the two new invariants.
- On a walkthrough with a known scuffed or cracked item: the damage is listed with the right second, cash value is below the undamaged figure, replacement is unchanged, and nothing in glare or shadow is called damage.
