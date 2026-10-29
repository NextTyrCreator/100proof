# ADR 0007: Walkthrough capture and the proof document

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
A personal-property inventory is still built by hand in a spreadsheet. The demo has to produce a document a person can attach to a carrier portal. It must not pretend to decide coverage, and it must not accept a video that was filmed earlier and uploaded as if it were this walkthrough.

## Decision
A scan is recorded in the browser when the person chooses Begin scan. A session runs up to 5 minutes, in 30-second clips. The microphone stays on so narration can name the room, the item, and a serial number. Another scan can be added to the same inventory.

The source video is kept and tied to the proof with the time it started and its duration. One still is taken from that source for the inventory row. Extra copies of the video are not made.

Recognition lists an item the scan puts over $10, with its quantity. An item over $500 is marked high value. A comparable price keeps its basis. A serial read from the scene or the narration stays on that item. Rooms are labeled from the walkthrough.

The document shows a total inventory value. It does not say the property is covered. The person can download it, email it, or send it.

## Consequences
The scan screen has no file picker. A verified account will store each inventory with these scan times. Until that account exists, a recording lives in the browser session. Item recognition is not claimed for a scan until a model pass fills the rooms. The rooms shown before that pass are a demo of the document.

## Update 2026-10-27
A new scan starts on a screen with no camera. The person enters a title, a country, and the address of the insured property, then presses Next. The country choices are the United States, Canada, the United Kingdom, and Europe. The address lookup stays inside that choice, and another country is another entry in the same list. A house number keeps suggestions that contain that number. Next takes one device reading and compares it with the address. The address text may be sent to the ArcGIS World Geocoding service to match a map point. The device coordinates stay in the browser and are kept with the scan time on the sealed record. Within one mile the address is checked. Farther than that, the distance is kept and it is not checked. Begin scan is the gesture that opens the camera and microphone. Create inventory seals a SHA-256 over the title, address, both points, the scan time, and a hash of the video bytes. Rooms are shards for a later recognition pass. Room names can be edited. Items found in a room can be deleted, not added by hand. The seal does not decide coverage.

## Update 2026-10-27 — review before the list

When the recording stops, the walkthrough is reviewed before any item is shown. The server sends the video to Muse Spark (`muse-spark-1.3`) through `packages/meta-client`. Speech in the video is narration and is treated as data. The prompt asks the model to match the video and the narration, and to write unknown when a fact is not shown. That is a quality bar for the review. The document does not print an accuracy score.

One call lists every piece, with a count. Clothes on hangers are the clothes. The line records whether they are women's, men's, kids', or unknown, and whether the size reads as kids, adults, or unknown. A brand or identifying mark is kept on the row, and a different brand or mark stays a different row. Ordinary pieces under $100 are bunched by room, category, type, brand, mark, wearer, and size. Jewelry, watches, firearms, silverware, art, appliances, electronics, furniture, instruments, collectibles, and anything with a serial stay on their own row.

A second call prices replacement new in the property's zip and jurisdiction. It searches the brand and the mark first. When that exact product is not for sale, the price is a similar item of like kind and quality, and the line says so. The street address is not sent. A serial may be sent with a picture so the model can name the product. The prompt tells it not to put the serial in the search. Cash value is computed in code from age and a useful life, and it stops at 20% while the piece is still in the home. If the age is unclear, cash value matches replacement. The note says a carrier can use another schedule. Neither amount decides coverage.

A later scan on the same inventory adds to the list. The same grouped line adds to its count. The person can also add a line, which is marked entered by you, and can attach a picture that reprices that line. A description note and a price-paid amount stay on the line. A price the person keeps is remembered on the device, without a serial.

## Update 2026-10-28 — location range

Within one mile, a teal circle with a check sits to the left of the address. The page does not say “Checked.” Farther than one mile, the page asks the person to allow location and keep the device within 1 mile. The download and the shared proof state that range and the time of the reading. They do not include the coordinates. The reading itself stays in the browser and in the sealed hash. Before Begin scan, a back arrow returns to the title, country, and address. On a later scan of the same inventory, that arrow returns to My inventory. A walkthrough session records up to 5 minutes. Every 30 seconds the recorder closes that clip and opens the next, so each file stays small enough to review. Pause closes the open clip and keeps the camera ready. Record continues. Done, the 5-minute limit, or 15 minutes of sitting still ends the session. Clips are reviewed in the order they were filmed and combined into one inventory. The file is encoded at 480p and 12 frames a second so a phone clip is not rejected for size.
