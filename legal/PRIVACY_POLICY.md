# 100proof Privacy Policy — DRAFT

**Status: DRAFT v0.1, 2026-10-26. Not yet reviewed by counsel. Updated in the same PR as any change to the tools that touch user data (see `legal/DATA_INVENTORY.md`).**

100proof ("we", "us") is operated by Buhrn Technologies LLC, Conroe, Texas, USA. This policy explains what we collect when you use 100proof.tech and demo.100proof.tech, why, who processes it, and your rights. It applies to users in the United States and the European Union/EEA/UK.

## 1. What we collect and why

| Data | Why | Legal basis (EU) | Retention |
| --- | --- | --- | --- |
| Account: email, name, Google account ID if you sign in with Google | To create and secure your account | Contract | Until you delete your account |
| Walkthrough video, extracted frames, masks, item crops, your answers to questions | To build your inventory; this is the service | Contract | Until you delete the scan; media hard-deleted within 30 days of deletion |
| Narration audio and its transcript (optional) | To attach your spoken claims to items | Consent | Same as the scan |
| Receipts and order emails from Gmail/Drive you connect (read-only; only messages matching receipt searches; message IDs, parsed fields, attachment hashes) | To confirm item values | Consent (you connect the source) | Until you disconnect the source or delete the item |
| Inventory records, valuations, Masters, Packets, share-link access logs | To keep and let you share your inventory | Contract; legitimate interest in integrity | Until you delete them; audit log keeps hashes only |
| Technical: IP address class, device type, browser, timestamps, error reports | Security, rate limiting, debugging | Legitimate interest | 90 days (logs); errors 30 days |
| Usage analytics (page views, Web Vitals) | To make the product faster | Consent in EU/UK; legitimate interest in US with opt-out | 13 months |
| Cookie consent record | To remember your choice | Legal obligation | 12 months |

We do not collect payment details in the hackathon build. We do not use session replay.

## 2. Who processes your data (sub-processors)
Every tool is listed in `legal/DATA_INVENTORY.md`. In summary: Supabase (database, file storage, authentication; US region), Vercel (hosting, CDN, performance analytics), Meta Platforms (Meta Model API: video, images and text are sent to recognize items, read receipts and draft documents; we use Standard mode, which Meta states does not use our content to train its models), Baseten (open-weight model inference for receipt parsing), Inngest (background job metadata, not media), Sentry (error reports with personal data scrubbed), Google (sign-in and read-only Gmail/Drive access you authorize), Resend (transactional email). We do not sell personal data and do not share it for advertising.

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
