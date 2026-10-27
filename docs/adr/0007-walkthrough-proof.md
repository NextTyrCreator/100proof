# ADR 0007: Walkthrough capture and the proof document

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
A personal-property inventory is still built by hand in a spreadsheet. The demo has to produce a document a person can attach to a carrier portal. It must not pretend to decide coverage, and it must not accept a video that was filmed earlier and uploaded as if it were this walkthrough.

## Decision
A scan is recorded in the browser when the person chooses Begin scan. The limit is 100 seconds. The microphone stays on so narration can name the room, the item, and a serial number. Another scan can be added to the same inventory.

The source video is kept and tied to the proof with the time it started and its duration. One still is taken from that source for the inventory row. Extra copies of the video are not made.

Recognition lists an item the scan puts over $10, with its quantity. An item over $500 is marked high value. A comparable price keeps its basis. A serial read from the scene or the narration stays on that item. Rooms are labeled from the walkthrough.

The document shows a total inventory value. It does not say the property is covered. The person can download it, email it, or send it.

## Consequences
The scan screen has no file picker. A verified account will store each inventory with these scan times. Until that account exists, a recording lives in the browser session. Item recognition is not claimed for a scan until a model pass fills the rooms. The rooms shown before that pass are a demo of the document.

## Update 2026-10-27
A new scan starts on a screen with no camera. The person enters a title and the address of the insured property, then presses Locate me. That is one device reading. The address text may be sent to Photon to match a map point. The device coordinates stay in the browser. Within one mile the address is checked. Farther than that, the distance is kept and it is not checked. Begin scan is the gesture that opens the camera and microphone. Create inventory seals a SHA-256 over the title, address, both points, the scan time, and a hash of the video bytes. Rooms are shards for a later recognition pass. Room names can be edited. Items found in a room can be deleted, not added by hand. The seal does not decide coverage.
