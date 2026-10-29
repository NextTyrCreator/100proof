# Data inventory: every tool that touches user data

Updated in the same PR that adds, removes or reconfigures a tool. This table feeds the Privacy Policy sub-processor list.

| Tool | Purpose | Data it receives | Region | Transfer basis (EU) | Status |
| --- | --- | --- | --- | --- | --- |
| Supabase | Postgres, Storage, Auth | Account email for one-time-code login; insurer inquiry company, contact, and work email. `inventories`: title, country, address and its map point, the within-1-mile result and its time (never device coordinates), rooms and lines, transcript lines with clip times, record hash. `item_events`: each change to a line with before, after, and its source. `cost_ledger`: call type, model, ok, latency, bytes, audio milliseconds, no content. Private `evidence` bucket under `org_id/inventory_id/`: clips (MP4), one still per clip, pictures added to a line. Signed links expire after an hour. Encrypted OAuth tokens when Gmail/Drive is connected. | US | SCCs | Active (Free plan) |
| Fly.io | Web app and worker hosting | Request logs (IP, UA) | US (`iad`) | SCCs | Active |
| Meta Model API (Meta Platforms) | Muse Spark 1.3 (listing, pricing, label, receipt, and answer checks), Muse Voice Transcribe 1.0 (narration). SAM 3.1, Muse Wonder, and Muse Image are not called in this build | Each 30-second clip, including its narration, is sent when it is reviewed. The clip's microphone track is sent as a 16 kHz mono WAV to Muse Voice Transcribe; the transcript comes back to the clip review as data. A label picture, receipt picture, or typed answer for one line is sent with that line's name, type, brand, marks, count, age, and the zip and jurisdiction. A second call sends item descriptions, brand, identifying marks, the zip, and the jurisdiction for a replacement search. The street address is not included. A picture the person adds to one item is sent to reprice that item. A serial may be sent so the model can name the product, and the request tells the model not to put the serial in the search. The account is not included. Standard mode (no training). | US | SCCs/DPF | Active |
| Inngest | Background jobs | Job payload metadata (IDs, timestamps), never media | US | SCCs | Active |
| Sentry | Error and performance monitoring | Stack traces, request IDs; PII scrubbed; session replay OFF | US | DPF | Active |
| Google (OAuth, Gmail API, Drive API) | Sign-in; read-only receipt search | Google account ID, matched message IDs and parsed receipt fields | US | DPF | Active (user-initiated) |
| Resend | Transactional email | Email address, message content (magic links, notices) | US | SCCs | Active |
| Upstash | Rate limiting | Hashed IP / user ID counters | US | SCCs | Active |
| Stripe | Payments | None in hackathon build | — | — | Not used |
| Session replay (any vendor) | — | — | — | — | Not used, by policy |
| Advertising / tracking pixels | — | — | — | — | Not used, by policy |
| Browser Geolocation API | One reading when the person presses Next, compared in the browser with the address. Only the result (within 1 mile or not) and its time are saved with the inventory. The coordinates are not saved and are not in the download | Latitude, longitude, accuracy in meters, time | On the device | Not transferred by 100proof | Active, user-initiated; coordinates browser session only |
| ArcGIS World Geocoding (Esri) | Match a typed address to a map point so the device reading can be compared. A check is shown when that reading is within 1 mile | Address text and the selected country or region. Device coordinates are not sent. | US | Not a stored transfer; the query leaves the browser | Active, user-initiated |
