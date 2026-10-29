# ADR 0010: Scan pipeline v2, the live scanner, and Connections

Date: 2026-10-30 · Status: Proposed · Approved-by: pending Steven Blackburn

## Context
An 11-clip phone test (house, patio, hot tub) showed the scan falling behind the camera. Listing took a median 38.4 s per clip and pricing another 19.3 s in the same request, so each clip took about 60 s while a new one arrived every 30 s. Eleven clips took 19 minutes. Six requests returned 502 after a listing ran out of output tokens, and none of those failures reached `cost_ledger`. The longest request (88 s) was close to the quick tunnel's 100-second cut-off. The list repeated objects across clips (the hot tub twice, once as an inflatable), lost spoken prices and years, and asked for labels on large items the camera had shown clearly. `docs/SCAN_PLAN.md` has the full diagnosis.

## Decision

**Listing and pricing are separate calls.** `POST /api/scan/review` lists one clip and returns (75 s budget, one attempt, 16,000 output tokens, empty fields left out). A truncated answer keeps its finished rooms. `POST /api/scan/price` prices only new lines, up to 30 at a time, while the next clip is listed. Lines with the same description are priced once, and a serial is never in the price call.

**Two clips are in flight.** The recorder sends up to two clips at once and applies results in clip order, so the list matches a one-at-a-time run. A failed clip is tried three times with a growing pause before Retry shows. Each listing call is told the room titles and line names already listed, as data.

**A repeat check runs once, at Done.** `POST /api/scan/reconcile` sends line text only (no media, no serials) and gets back groups that may be the same object. `lib/scan-pipeline.ts` decides: same category only, never two lines from one clip, never two serials, the line with the most evidence is kept, the count is the larger one, and each join is in the line's change log. A final pricing pass follows.

**Sessions are 10 minutes.** A scan is up to 20 clips of 30 seconds. Scan more on a saved inventory adds up to 5 minutes.

**The live scanner is display only.** While recording and the tab is visible, `ScanGlance` sends a 384-pixel still at most every 4 seconds, only when the view changed or 15 seconds have passed, to `POST /api/scan/glance`. The names it returns are shown over the camera and go stale after 12 seconds. They never become lines; the clip review does that. Nothing is stored.

**What was said counts.** The listing returns a spoken price paid (`pricePaidUsd`, shown as "Price from you") and a bought year (`boughtYear`), and the age comes from the year, a stated age, or a year in the narration. Each category has a default useful life for depreciation. A voice note on one line (`POST /api/scan/voice`, up to 30 s) is transcribed and checked like a typed answer.

**Ask less.** A label is requested only when the model is open, there are at least two likely models more than 40% apart in price, and the item is not furniture, an appliance, or a large fixed item (hot tub, spa, grill, sofa, and similar). Those are priced from the video, the higher likely model when two are close, and marked Estimated from video with Use this estimate.

**Receipt verified means a receipt.** The top mark (accuracy mark v2, `STANDARD.accuracyMarkVersion` 2) needs a receipt-photo change that set the price paid. A typed or spoken price is its own signal, "Price paid from you", and never the receipt tier.

**Connections starts with files.** `/connections` reads receipts, invoices, order confirmations, and quotes chosen from the device (JPEG, PNG, WebP, PDF up to 8 MB; one at a time) through `POST /api/connections/receipt`, which matches lines to the inventory. A match is applied only when the person presses Apply; then the file is kept in the private `evidence` bucket (now also accepting `application/pdf`, migration `20261030010000`) and the line gets the price paid, the age from the date, and, for a high-confidence brand or model match, the identity. Email and assistant tools (MCP) are listed as planned and do nothing yet.

**Failures are measured.** Every call is recorded in `cost_ledger`, including failures with `ok = false`, and the server logs a reason code (`incomplete`, `timeout`, `upstream`, `parse`, `limit`). Migration `20261030000000` widens the call types to list, price, photo, narration, reconcile, glance, receipt, and voice. Daily limits per account: 8 reviews, 80 clips, 30 photos, 120 price batches, 10 repeat checks, 600 glances, 40 voice notes, 60 files.

## Exception to ENGINEERING_STANDARDS §2
ADR 0009's in-request exception now also covers `/api/scan/price`, `/api/scan/reconcile`, `/api/scan/glance`, `/api/scan/voice`, and `/api/connections/receipt`. They call a model and run longer than 300 ms, and their answers are needed on screen while the person is filming or sorting receipts. The Inngest worker is not deployed. The daily limits are in memory on the one web machine. Moving listing, pricing, and receipts to Inngest with results pushed to the page is phase 2 in `docs/SCAN_PLAN.md`.

## Consequences
Review should keep pace with filming: about 40–45 s per clip with two in flight against one new clip every 30 s. That is a target until the live latency check in `docs/EVAL.md` is run on a phone. The repeat check can miss a duplicate it was not told about, and it never joins one the rules forbid.

The live scanner adds up to 15 small image calls a minute while recording. It stops when the tab is hidden or the camera stops.

PDF reading by Muse Spark 1.3 through `input_file` has not been tried against the API in this build. Images use the same path as label photos.
