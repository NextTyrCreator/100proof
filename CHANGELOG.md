# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Changed
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
- Information (`/information`), readable without signing in: how it works, what homeowners and renters get, why to inventory before a loss, what insurers, adjusters, and administrators get, the questions people search for with standalone answers, plain terms, and sources. Buttons open For insured or For providers. The page carries FAQ and app structured data from the same text, and is in the sitemap. Search and answer bots are allowed in `robots.txt`. Ranking rules, thresholds, the test method, and go-to-market numbers stay off the site and out of `llms.txt`.
- On For insured, "Create your verifiable inventory now" sits above the email field with an arrow pointing to it.
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
