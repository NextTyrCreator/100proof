# Evidence a carrier can pick up

This is a research note for the hackathon build. It is not a coverage determination, a sworn proof of loss, or an opinion that 100proof satisfies every insurance law in every country. A lawyer in each market still has to read the policy and the local statute. What follows is the evidence those forms already ask a person to produce, and the complaints that show up when that evidence is missing.

## What the standard forms ask for

Residential contents, ISO homeowners sample HO-3, Section I Conditions, Duties After Loss. The Insurance Information Institute publishes a sample of that form. Duty 6 says the insured prepares an inventory of damaged personal property showing quantity, description, actual cash value, and amount of loss, and attaches bills, receipts, and related documents that justify the figures. Duty 8 says a signed, sworn proof of loss, if the insurer requests it, includes that inventory. The sample is at https://www.iii.org/sites/default/files/docs/pdf/HO3_sample.pdf.

Commercial business personal property, ISO Building and Personal Property Coverage Form CP 00 10, Duties In The Event Of Loss Or Damage. At the insurer's request the insured gives complete inventories of the damaged and undamaged property, including quantities, costs, values, and the amount of loss claimed, then a signed sworn proof of loss within 60 days after the insurer asks. One published copy of the form is at https://www.iiat.org/uploads/files/general/InfoCentral/Commercial-Property/cp0010.pdf.

Those duties are contract conditions. They are not a statute that says a video inventory is automatically accepted in every jurisdiction. The product records the fields the conditions name: quantity, description, a value, and the source that justifies the value. It does not sign a proof of loss and it does not state that a loss is covered.

## Rules that change how an inventory is accepted

California, after a declared emergency and a total loss of a primary residence, limits how a carrier may demand the contents list. The California Department of Insurance 2026 adjusting guide quotes Insurance Code section 2061: the insurer may not require its own inventory form if the insured provides a form with substantially the same information, and it must accept groupings of categories where listing every item is impractical (clothing, books, and similar). The guide is at https://www.insurance.ca.gov/0200-industry/0050-renew-license/0200-requirements/upload/2026-Guide-for-Adjusting-Property-Claims-in-California-After-a-Major-Disaster_Final.pdf.

The same department's home inventory guide tells people to film each room, show receipts beside the item, show the serial number, narrate slowly, and date the recording. It also says to keep a copy somewhere other than the house. https://www.insurance.ca.gov/01-consumers/105-type/95-guides/03-res/upload/Website-Version-Home-Inventory_Revision-September-17th-2.pdf.

Outside the United States there is no single ISO form. Canadian provincial statutory conditions, UK policy conditions, and Australia's Insurance Contracts Act still turn on the same practical point: the person has to show what was there and what it was worth. 100proof does not claim those statutes are met. The file is built so a local policy can be checked against the same columns.

## Complaints this file is built to answer

Iowa's insurance division, pointing at the NAIC home-inventory guidance, says that without an inventory carriers estimate contents and that estimate often underpays. People cannot remember the house after a fire. https://iid.iowa.gov/consumer-connection/2025-03-04/consumer-connection-importance-home-inventory-disaster-or-insurance-claim.

United Policyholders' contents guidance says the fight is usually depreciation. Actual cash value is paid first. Replacement cost often requires the person to replace the item and send the receipt back. Insurers do not volunteer that second payment. Unsupported prices and a worksheet the person cannot see are the usual dispute. https://uphelp.org/claim-guidance-publications/10-tips-for-settling-the-contents-portion-of-your-claim/ and https://uphelp.org/claim-guidance-publications/depreciation-basics/.

NAIC consumer material lists unsatisfactory settlement amounts among the common reasons people complain about a carrier. A contents file that already separates a scan estimate from a source-backed price gives both sides something to point at.

## What 100proof keeps, and what it refuses to say

The walkthrough is filmed in the phone browser, at that time, in 30-second clips, for up to 15 minutes. Scan more on a saved inventory adds up to 5 minutes. The source video stays with the inventory and can be downloaded to the device. Muse Voice Transcribe 1.0 transcribes the narration with timestamps. Muse Spark 1.3 lists each clip from the video and that transcript. Room chips set the room from the second they are tapped, and a line takes the room tapped at the second it was seen. With no tap, an unclear room is "Room not set", and a closet folds into the room it opens from. Every model response is checked with zod before it touches a line. Untrusted text is data, never instructions.

A line carries one confidence number from the evidence on it. A formal appraisal with its document attached is 99 and sets the value. A receipt that names the item is 99. A model number read from a label close-up or by two agreeing reads is 95, a confirmed model name 90, a brand and matching model 85 (over $250 only when the video backs that version), an ordinary item under $250 priced from a store page 75, a brand alone over $250 65, and nothing identifying over $250 40. An unchecked price is held at 60, an open count at 70, and a conflict at 50, including a comparable outside half to double the price the owner stated. A line counts at 75 under $250 and 85 above. A value the person declares is shown separately and never replaces the researched price. A receipt photo or PDF matched to a line moves that line to 99. Actual cash value is left unset until the age is known. Connections also accepts an invoice, a quote, or an order email saved as a PDF. A piece over $500 is marked high value. Condition and damage lower actual cash value. Replacement stays the price of a new one. Neither amount decides coverage, and a comparable is never presented as a receipt.

The record is sealed with a hash. The handoff is a JSON claim file and a CSV, both with sources. The homeowner can delete an inventory. Every model call is written to `cost_ledger`.

`recognition_memory` is a table for an object key, a shard, and counts of confirmed or corrected outcomes. It holds no names, emails, serials, photos, or free-text descriptions. The scan writes no rows there. Promoting a de-identified count is planned.

A provider inquiry is stored in `insurer_inquiries`. Payments are off.
