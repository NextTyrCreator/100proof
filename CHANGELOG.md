# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Added
- Each clip's listing checks condition (new, good, fair, worn, damaged) and notes damage it can see with a severity and the second it is clearest. Damage lowers cash value (minor keeps 90%, moderate 70%, severe 40%, after wear); replacement stays the price of a new one. A later clip's worse damage is kept and the cash value recomputed. A photo or an answer can correct the condition.
- When no brand is read or said, the listing may name a likely brand with its clues. It is shown as "Likely …, not confirmed", priced as a comparable, and cleared by a label or receipt brand.
- The price batch checks each comparable against the line's kind, size, material, features, and brand. "Exact:" is downgraded to "Comparable:" unless the brand or model is confirmed.
- The check at Done runs on every scan and also fixes categories, only to a listed category, logged as changed by the check.
- New invariants (set 2): damage not reflected in cash value (blocker), damaged without a note, exact without a confirmed identity, likely brand marked settled, unknown category. The claim file is schema 2, with condition, damage, and likely brand per line; the CSV adds the same three columns.
- Information explains condition and damage in the steps and the example line, and answers "How does 100proof handle damage or wear?" and "What if I do not know the brand?".

### Fixed
- "Undamaged" and "not new" are no longer read as damaged or new. A likely brand no longer marks the model as settled.
- A category correction recomputes cash value on the new kind's useful life. Joining the same object keeps an age or worse damage from the other clip and recomputes cash value. The useful life stays on the line.
- A grouped line under $100 does not take one piece's damage off the group price.

### Changed
- For providers has its own screen: no arrow, its own headline, four points for claims and underwriting desks, and a short form (work email, company, name, lines of business, optional note). On a phone, a For insured / For providers switch sits above the headline, since the header tabs are in the menu there. `/?for=providers` opens the provider screen directly.
- Information is rebuilt as a plain product page: the search phrase as the heading, one action, three steps, an example inventory line with its evidence, short sections for homeowners and for providers, the regulator facts as a list, questions as accordions, then terms and sources. The gradient cards, pills, and highlighted headings are gone. Two questions are added: whether 100proof is the NAIC app (it is not), and how it differs from other home inventory apps.
- A scan is up to 10 minutes in 30-second clips; Scan more on a saved inventory adds up to 5. Two clips are reviewed at once and applied in order, a failed clip is retried three times before Retry shows, and pricing runs separately while the next clip is listed (ADR 0010).
- Each clip's listing is told the rooms and lines already listed. At Done, a text-only repeat check joins the same object seen in different clips, under fixed rules: same category, never two lines from one clip, never two serials, the larger count, and a change-log entry.
- A spoken price paid and a spoken year are kept: the price shows as "Price from you", and the year sets the age used for cash value. Each category has a default useful life.
- Large and fixed items (furniture, appliances, hot tubs, grills, play sets) are priced from the video and marked Estimated from video, with Use this estimate. A label photo is asked for only when the likely models differ by more than 40% in price.
- Receipt verified needs a receipt that lists the item. A typed or spoken price paid is its own signal and never the top mark (accuracy mark v2).
- The inventory list folds by room and by line. Each line shows a picture (your photo, or a frame from its clip cut on the phone), its evidence, and its value; opened, it has more frames, Add photo, price paid, description, Add receipt, Talk about it, and the evidence record. Source video folds into one row.
- The "Step 1" badge and its pulsing dot are replaced by a plain Email · Code · Scan row, and the code screen uses the same card, field, and button as the email screen. The labels on Information and For providers lose the pill and the dot.
- Failed model calls are recorded in `cost_ledger` with `ok = false` and a reason code, so the measures show the real failure rate. Speaker tags are removed from transcripts.
- Every page load opens on For insured with the email sign-in. "Which describes you?" is gone, and the choice is no longer kept in a cookie. The menu shows For insured, For providers, and Information.
- The underinsurance pitch moved from the sign-in screen to Information.
- "Email me a code" and the other gradient buttons no longer have a navy border, so they match the rest.
- `llms.txt` describes the evidence loop, the valuation method, the models by version, what 100proof is not, and accuracy measured on recorded cases instead of a percentage.
- The claim file counts a line as changed by evidence only when a label, receipt, picture, clip, or answer changed it, not a hand edit.
- The first screen leads with underinsurance: a 100-second verifiable inventory, labeled loss estimates, and a 95% review goal aimed at 98%.
- The line under that headline is set in a regular weight, sized for a phone first and a desktop column that matches the form.
- “100 seconds and rest assured.” sits on one line, and the underline under “100 seconds” draws in once.
- The headline arrives one letter at a time, then “Don’t be like them,” then the rest of the screen.
- “Don’t be like them.” drops into a gap, then shakes once it lands. “100 seconds” and its underline use the navy of “Proof.” The email button keeps a smooth drift between two close blues, with a navy stroke.
- A signed-in header shows the account email and log out. Inventory is the only destination there. The scan and the insured steps live on the inventory screen. For providers stays on the signed-out screen.
- Next asks for a fresh location reading every time. If it is declined or the reading fails, the scan stays closed until location is allowed.
- A visible brand or identifying mark is stored on the row and used to price it. The exact product is priced when it is for sale. Otherwise the amount is a similar item of like kind and quality, and the line says which. A different brand or mark stays a different row.
- When a scan stops, the walkthrough is reviewed before any item is shown. Ordinary pieces under $100 are counted on a category line, with who the clothes fit and whether the size is kids, adults, or unclear. Replacement uses the property zip and jurisdiction. Cash value is an adjuster's depreciation estimate. A missed item can be added by hand or picked up on another scan. A picture can reprice that line. A serial can identify the product and is not put in the price search.
- A refresh on a new scan clears the draft and shows the title, country, and address form.
- A new scan asks for a country before the address. The choices are the United States, Canada, the United Kingdom, and Europe, and suggestions that include a house number stay on that number. Next takes one location reading, checks it against the address, and opens the scan. The reading is kept with the scan time.
- My inventory leads with four steps, then New scan. Step numbers are navy. A step takes a light highlight under the pointer. A scan that has not been saved stays off the list, and the page shows no inventory value until one exists. A saved inventory is a row with its picture, title, and the date it was created.
- Signed in, the home page is the inventory, titled “My inventory.” A new scan asks for a required title and the address of the insured property before the camera opens. Next compares one device reading with that address. Within a mile it checks; farther than a mile it keeps the distance. Create inventory seals a SHA-256 of that record and the walkthrough. Room items can be removed. A missed item can be added, and it is marked entered by you.
- A provider request confirms in place, with the reference number and the person who submitted it.
- Walkthrough length in the README, package description, and judging map is 100 seconds.
- Within a mile, a teal check sits beside the address and the “Checked” sentence is not shown. Farther than a mile, the page asks for location and a device within 1 mile. The download records that range and leaves out the coordinates.
- Before Begin scan, a back arrow returns to the title, country, and address. On another scan of the same inventory, it returns to My inventory.
- Take a video. Get an automated inventory with verified proof, and insure it properly. The name stays 100proof. The first screen no longer says the scan is 100 seconds. A session records up to 5 minutes, in 30-second clips. The page does not say the list is 100% accurate, and it does not say a policy is bound.
- The next product plan keeps the 5-minute session, a photo on a line, and another clip on the same inventory. Price and campaign follow from that record.
- The device location reading is no longer kept with the inventory. Only whether it was within 1 mile of the address, and when, is saved.
- The accuracy goals are measured on recorded cases, guided against unguided, instead of a kept-or-corrected ratio that the app never showed.

### Removed
- `POST /api/scan/review/photo`, replaced by `POST /api/scan/review/evidence`.
- The unused `ItemForm` component and `lib/accuracy.ts`.
- A sign-in code lasts 10 minutes. Asking again for the same email replaces that code once a minute, up to five times an hour. Five wrong codes pause sign-in for 15 minutes. Closing the tab still shows the code box.

### Added
- Live scanner: while the camera records, corner marks and a sweep show the scan is active, and the main objects in view are named over the picture (Muse Spark 1.3, a small still at most every 4 seconds; display only, nothing stored). The line count updates as clips are listed.
- Connections: choose receipts, invoices, order confirmations, or quotes (images or PDF) from the device, see which lines each one matches, and apply a match to mark the line Receipt verified. A file is kept only when applied. Email and assistant tools (MCP) are shown as planned.
- Talk about it: a voice note of up to 30 seconds on any line, transcribed by Muse Voice Transcribe 1.0 and checked like a typed answer.
- Harness checks for label requests, spoken ages, transcript tags, truncated listings, the 10- and 5-minute clocks, the clip queue, pricing, and the repeat-check rules (44 checks).
- `docs/SCAN_PLAN.md` and ADR 0010. Migrations widen `cost_ledger` call types and let the `evidence` bucket hold PDFs; both applied to 100proof-dev.
- An accuracy mark on every line: nine checkable evidence signals, shown as Needs evidence, Settled on camera, Strong without a receipt, or Receipt-confirmed — the receipt being the one mark that ties an item to its owner. The same marks are counted in Measures and written per line in the claim file. It is never shown as a percentage.
- `docs/RESEARCH_LOOP.md`: how session corrections, skipped asks, receipt deltas, eval cases, and outside research become one gated change at a time.
- A testing engine (`pnpm --filter @100proof/web harness`): deterministic checks over the accuracy mark, the evidence ranking, and the eval scorer, failing with exit 1. Every finished file is also run against invariant checks — contradictions are blockers, outliers are flagged — shown in Measures as "What to look at" and exported with the claim file.
- The claim file now carries an audit block and the versioned standard that produced it (`lib/standard.ts`): format, schema, mark version, invariant set, and compliance register date.
- `docs/COMPLIANCE_REGISTER.md` (valuation, claims-conduct, and privacy rules by jurisdiction, each with its primary source and check date), `docs/GOVERNANCE.md` (the auditability rules behind the file), `docs/EXPERIMENTS.md` (hypotheses written before levers change), and `docs/USER_TESTING.md` (who tests, on what tasks, after which gates, and how reports feed the loop).
- The summary now states, in plain terms, what an active inventory supports if a covered loss happened today — and that payment itself depends on the policy. The Information page gains an auditability section and answers on what comes back and on relying on the file.
- Information (`/information`), readable without signing in: how it works, what homeowners and renters get, why to inventory before a loss, what insurers, adjusters, and administrators get, the questions people search for with standalone answers, plain terms, and sources. Buttons open For insured or For providers. The page carries FAQ and app structured data from the same text, and is in the sitemap. Search and answer bots are allowed in `robots.txt`. Ranking rules, thresholds, the test method, and go-to-market numbers stay off the site and out of `llms.txt`.
- On For insured, the sign-in card leads with a Step 1 badge, highlights "Enter your email to create your verifiable inventory now", and draws a curved gradient arrow with a traveling light pulse into the email field. The button says Begin.
- Measures under View summary: filmed time, lines settled, still open and dollars in doubt, requests left for the reviewer, lines changed by each kind of evidence, hand edits, time from the first clip to the last change, and model calls with failures, median latency, and transcription cost. The claim file carries the same document measures. `GET /api/inventories/[id]/measures` reads the calls under RLS.
- A live phone test checklist and results table in `docs/EVAL.md`.
- The evidence loop (ADR 0009). Each line says whether its count and model are settled. While filming, a hint asks for the one thing worth the most: snap the label, step back for every chair, find the receipt, or answer a question. "Not now" and "Leave it" keep it from asking again.
- A label, receipt, picture, or typed answer settles one line and returns only what changed. A receipt sets the price paid and the age, and never replaces the replacement estimate. "Film it" opens a clip that settles the named lines instead of adding rows.
- What you say while filming is transcribed by Muse Voice Transcribe and attached to the line, with the time in the clip.
- Every line has an Evidence panel: the camera and when, what was said, the price paid, the exact product or comparable with its date, possible models, and every change with its source.
- "Still open" at the top of an inventory lists what is not settled, most money in doubt first.
- Claim file (JSON), schema 1: clips with hashes and transcript lines, each line's evidence by source and changes, open requests as exceptions, totals, and a work statement marked hypothetical. The CSV adds evidence sources, both settled flags, and a change count.
- Inventories save to your account and open on any device. Clips, stills, and pictures are kept in private storage behind links that expire in an hour. A save from an older copy is refused instead of overwriting.
- Each model call is recorded with its type, model, result, time, and size, without its content.
- A guided-versus-unguided eval (`docs/EVAL.md`) reviews the same walkthrough twice and scores both against a hand-written list.
- Price hypotheses, buyer math, lines, and the campaign are in `docs/GTM.md`. Payments stay off.
- Brand loading mark: the ring and check turn together, one rotation every 1.5 seconds, fading in and handing off to the next screen.
- Provider form asks only for a connection or more information. The page ends with a copyright line.
- Floor-plan background sits behind the page at 28% opacity.
- Email one-time-code login, a blank inventory, carrier reach-outs, and a static hackathon footer (ADR 0008).
- Demo walkthrough UI: live 100-second scan, inventory document, and download, email, or send. No coverage decision (ADR 0007).
- Brand lock: logo, palette, and motion tokens (ADR 0006).
- ADR 0005: Meta Model API, Supabase Free, and one Fly.io machine. Vercel, Baseten, and Modal are out.
- Repository governance: branch model, commit convention with AI-attribution and approval trailers, PR and issue templates, CODEOWNERS, commitlint, CI.
- Engineering standards (security, performance, data, observability) and performance budgets.
- Draft Privacy Policy, Terms of Service, cookie consent specification, data inventory, contact page content.
- Environment variable register and `.env.example`.
- ADRs 0001–0004.
