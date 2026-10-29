# Data inventory: every tool that touches user data

Updated in the same PR that adds, removes or reconfigures a tool. This table feeds the Privacy Policy sub-processor list.

| Tool | Purpose | Data it receives | Region | Transfer basis (EU) | Status |
| --- | --- | --- | --- | --- | --- |
| Supabase | Postgres, Storage, Auth | Account email for one-time-code login; insurer inquiry company, contact, and work email; inventory records, video/frames/crops, receipts metadata, encrypted OAuth tokens | US | SCCs | Active (Free plan) |
| Fly.io | Web app and worker hosting | Request logs (IP, UA) | US (`iad`) | SCCs | Active |
| Meta Model API (Meta Platforms) | SAM 3.1, Muse Spark, Muse Wonder, Muse Image, Voice Transcribe, receipt parsing | The walkthrough video, including its narration, is sent when a scan is reviewed. A second call sends item descriptions, brand, identifying marks, the zip, and the jurisdiction for a replacement search. The street address is not included. A picture the person adds to one item is sent to reprice that item. A serial may be sent so the model can name the product, and the request tells the model not to put the serial in the search. The account is not included. Standard mode (no training). | US | SCCs/DPF | Active |
| Inngest | Background jobs | Job payload metadata (IDs, timestamps), never media | US | SCCs | Active |
| Sentry | Error and performance monitoring | Stack traces, request IDs; PII scrubbed; session replay OFF | US | DPF | Active |
| Google (OAuth, Gmail API, Drive API) | Sign-in; read-only receipt search | Google account ID, matched message IDs and parsed receipt fields | US | DPF | Active (user-initiated) |
| Resend | Transactional email | Email address, message content (magic links, notices) | US | SCCs | Active |
| Upstash | Rate limiting | Hashed IP / user ID counters | US | SCCs | Active |
| Stripe | Payments | None in hackathon build | — | — | Not used |
| Session replay (any vendor) | — | — | — | — | Not used, by policy |
| Advertising / tracking pixels | — | — | — | — | Not used, by policy |
| Browser Geolocation API | One reading when the person presses Next, kept with that inventory so it can be compared with the address. The download states the range and does not include the coordinates | Latitude, longitude, accuracy in meters, time | On the device | Not transferred by 100proof | Active, user-initiated, browser session only |
| ArcGIS World Geocoding (Esri) | Match a typed address to a map point so the device reading can be compared. A check is shown when that reading is within 1 mile | Address text and the selected country or region. Device coordinates are not sent. | US | Not a stored transfer; the query leaves the browser | Active, user-initiated |
