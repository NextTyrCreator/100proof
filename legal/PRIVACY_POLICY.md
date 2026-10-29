# 100proof Privacy Policy — DRAFT

**Status: DRAFT v0.1, 2026-10-26. Not yet reviewed by counsel. Updated in the same PR as any change to the tools that touch user data (see `legal/DATA_INVENTORY.md`).**

100proof ("we", "us") is operated by Buhrn Technologies LLC, Conroe, Texas, USA. This policy explains what we collect when you use 100proof.tech and demo.100proof.tech, why, who processes it, and your rights. It applies to users in the United States and the European Union/EEA/UK.

## 1. What we collect and why

| Data | Why | Legal basis (EU) | Retention |
| --- | --- | --- | --- |
| Account: email, name, Google account ID if you sign in with Google | To create and secure your account | Contract | Until you delete your account |
| Walkthrough clips and a still from each, pictures you add to a line (labels, receipts, the item), your typed answers to questions | To build your inventory; this is the service. Clips and pictures are kept in private storage on your account and opened only through links that expire after an hour | Contract | Until you delete the inventory; media hard-deleted within 30 days of deletion |
| What you say while filming | The microphone track of each clip is sent for transcription so what you said can be attached to the right line. The transcript lines and the times in the clip are kept with the inventory. The separate audio file is not kept; the sound stays inside the clip itself | Contract | Same as the inventory |
| A record of how each line changed | Each change keeps what it was before, what it is after, and what caused it (a clip, a label picture, a receipt, your answer, your edit), so a reviewer can see where every fact came from | Contract; legitimate interest in integrity | Same as the inventory |
| Usage records: which model call ran, whether it worked, how long it took, and how many bytes or audio seconds it used | To know what each inventory costs to make. No content of the call is kept | Legitimate interest | Same as the inventory |
| Receipts and order emails from Gmail/Drive you connect (read-only; only messages matching receipt searches; message IDs, parsed fields, attachment hashes) | To confirm item values | Consent (you connect the source) | Until you disconnect the source or delete the item |
| Inventory records, valuations, Masters, Packets, share-link access logs | To keep and let you share your inventory | Contract; legitimate interest in integrity | Until you delete them; audit log keeps hashes only |
| Technical: IP address class, device type, browser, timestamps, error reports | Security, rate limiting, debugging | Legitimate interest | 90 days (logs); errors 30 days |
| Precise location and the address of the insured property | To record where that walkthrough was filmed and compare it with the address you enter. Next takes one reading, not a continuous track, and those coordinates stay in the browser. The saved inventory keeps only whether the reading was within 1 mile of the address and when it was taken; the device coordinates are never saved. The address, its map point, and the country or region are saved with the inventory. The address text and the country or region you select may be sent to the ArcGIS World Geocoding service to match a map point. | Consent | Device coordinates: browser session. The within-1-mile result and the address: same as the inventory |
| Usage analytics (page views, Web Vitals) | To make the product faster | Consent in EU/UK; legitimate interest in US with opt-out | 13 months |
| Cookie consent record | To remember your choice | Legal obligation | 12 months |

We do not collect payment details in the hackathon build. We do not use session replay.

## 2. Who processes your data (sub-processors)
Every tool is listed in `legal/DATA_INVENTORY.md`. In summary: Supabase (database, file storage, authentication; US region, Free plan), Fly.io (web app and worker hosting), Meta Platforms (Meta Model API: each walkthrough clip and its narration are sent to itemize it, and the clip's microphone track is sent to Muse Voice Transcribe to write down what you said; a label picture, a receipt picture, or a typed answer you give for one line is sent with that line's description to settle it; and item descriptions, brand, identifying marks, plus the zip and jurisdiction are sent for a replacement search; the street address is not included; a picture added to one item is sent to reprice it; a serial may be sent to name the product and is not put in the search; we use Standard mode, which Meta states does not use our content to train its models), Inngest (background job metadata, not media), Sentry (error reports with personal data scrubbed), Google (sign-in and read-only Gmail/Drive access you authorize), Resend (transactional email). We do not sell personal data and do not share it for advertising.

## 3. Your choices and rights
- Connect or disconnect Gmail/Drive at any time; disconnecting revokes our access at Google and deletes cached evidence.
- Export your inventory (JSON, PDF, CSV, media archive) and delete your account from Settings; deletion propagates to storage within 30 days.
- EU/UK/California residents: access, correction, deletion, portability, restriction, objection, and the right to complain to a supervisory authority. Contact: see `legal/CONTACT.md`.
- Analytics cookies are off until you accept them in the EU/UK; in the US you can opt out in the cookie settings. We honor Global Privacy Control signals.

## 4. Security
Encryption in transit (TLS) and at rest; row-level access control; encrypted storage of connected-account tokens; signed, expiring share links; append-only audit log. Details: `docs/ENGINEERING_STANDARDS.md` §1.

## 5. International transfers
Data is stored in the United States. For EU/UK users, transfers rely on the sub-processors' Standard Contractual Clauses / Data Privacy Framework certifications, listed in the data inventory.

## 6. Children
100proof is not for anyone under 18. Please do not film other people; faces that appear in evidence frames are blurred in anything shared.

## 7. Changes
We will post changes here with a new version and date. Material changes are announced in the app.

## 8. Contact
See `legal/CONTACT.md`.
