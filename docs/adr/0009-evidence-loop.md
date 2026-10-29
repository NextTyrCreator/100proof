# ADR 0009: The evidence loop, saved inventories, and the eval

Date: 2026-10-29 · Status: Proposed · Approved-by: pending Steven Blackburn

## Context
A walkthrough produces a list. A list a claims professional can review needs more: which lines are certain, which are not, what would settle them, and where every fact came from. The product plan for 100 Proof keeps the 5-minute session in 30-second clips, a photo snapped onto a line, and another clip added to the same inventory. It adds one capability at the center:

100proof notices what it cannot establish, asks for the missing evidence, and uses that evidence to complete a contents file a claims professional can review.

Until now the inventory lived in the browser tab. A file someone hands to an adjuster has to survive a refresh, keep its media, and show its history.

## Decision

**Narration is transcribed separately.** Meta says Muse Spark audio input is not fully supported. The browser taps the microphone during each clip, resamples to 16 kHz mono 16-bit, and sends one WAV with the clip. The server sends it to Muse Voice Transcribe 1.0 (`/asr/transcribe`, `ENDPOINTING`) in parallel with the video upload. The transcript lines and their times go to the listing call as data, labeled as not instructions. A fact taken from them is marked "transcribed". If transcription fails, the clip is still reviewed and a fact the video model heard is marked "heard by the video model". The WAV is not stored.

**Each line says what it does not know.** The listing call returns, per line: when it was seen in the clip, when it was mentioned, whether the count is settled, whether the identity is settled (unsettled when the brand or model could move the price by more than $50), up to three possible models with a price range, and one ask: a label, a wider shot, a receipt, or a question. Every field is zod-checked; a bad ask becomes no ask.

**Requests are derived, not stored.** `lib/evidence-requests.ts` reads the lines and makes the requests: a label while identity is not settled, a wider shot while the count is not settled, a receipt or a question when the model asked for one. Each is scored by dollars in doubt divided by effort (question 1, label 2, receipt 3, wider shot 4). Under $25 in doubt is not asked. Three are shown at once. "Leave it" is saved on the line, so the request does not come back. Because requests come from the line, settling the line is what closes them. There is no second list to keep in step.

**Evidence goes through one route.** `POST /api/scan/review/evidence` takes a label picture, a plain picture, a receipt picture, or a typed answer for one line, and returns only the fields that changed. A receipt sets the price paid and the age from the purchase date; it never replaces the replacement price. A serial can identify the product and is not put in the search. A clip filmed from a request carries a focus note naming the lines to settle, and merges into those lines instead of adding rows.

**Every change is logged on the line.** A change keeps the fields before and after, when, and the source: a clip, a label picture, a receipt picture, a picture, your answer, or your edit. The item record in the app shows the sources apart: the camera (clip and time), what was said, the price paid, the exact product or comparable with its date and link, possible models, and the change list.

**Saved inventories are a validated document plus an event log.** `inventories` holds one JSONB document per inventory (schema version 1) with an optimistic `version`. A save with a stale version gets 409 and does not overwrite. `item_events` is append-only and receives each change once. `cost_ledger` records every model call: type, model, ok, latency, bytes, audio milliseconds, and no content. All three tables carry `org_id`, have RLS enabled and forced, and use `is_org_member`. A personal organization is created on first save by `ensure_personal_org()`. We chose a document over normalized item tables because one person edits one inventory, the document is already checked by zod on both sides, and the time left in the event is short. The event log keeps the history queryable. If several parties edit one file, items move to their own rows.

**Media is private.** Clips, one still per clip, and pictures on a line upload from the browser to the private `evidence` bucket at `org_id/inventory_id/name`, under storage policies that check the org. The document stores paths, never URLs. Opening an inventory signs links that last an hour.

**Location is a result, not a coordinate.** The device reading stays in the browser. The saved inventory keeps whether it was within 1 mile of the address, and when. The address and its geocoded map point are saved.

**The export is versioned.** "Claim file (JSON)" is `100proof.inventory` schema 1: clips with hashes and transcript lines, each line with its evidence by source and its changes, the requests still open as exceptions with dollars in doubt, totals, and a work statement marked hypothetical. Payments are off. The CSV adds the evidence sources, both settled flags, and the change count.

**The eval tests the claim.** `apps/web/scripts/eval/run.ts` reviews a recorded case twice with the same code the app uses: unguided, then guided by the ranked requests and the evidence the case provides. It scores both against a ground-truth list. `docs/EVAL.md` records the method and the numbers.

## Exception to ENGINEERING_STANDARDS §2
Clip review and evidence checks call a model and run longer than 300 ms, so the standard sends them to Inngest with per-user concurrency 1. They stay in the request path in this build because a clip's list has to come back while the person is still filming, and the Inngest worker is not deployed. The daily limits per account are in memory on the one web machine. Moving review to Inngest, with results pushed to the page, is the follow-up.

## Consequences
The file a person sends now says what is uncertain instead of hiding it, and it shows why each line is what it is. An adjuster can see the exceptions first.

The JSONB document limits server-side queries over items. The event log and the export cover what a reviewer needs today.

Transcription adds a call per clip, $3 per 1,000 audio minutes, and about 1 MB of upload per 30 seconds. If the WAV tap fails on a device (iOS AudioContext after the camera opens is not yet tested on a phone), the clip is still reviewed with the video's own audio.
