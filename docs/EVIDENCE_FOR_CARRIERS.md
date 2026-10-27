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

The walkthrough is recorded on the site, at that time, for up to 100 seconds, and the source video can be downloaded to the device. Narration stays in the audio. A later recognition pass lists items it prices over $10, marks items over $500 as high value, and holds anything it scores under 90% for a name, a description, a price, and a source. The source can be a receipt, a quote, an invoice, or an email. The scan estimate and the source-backed price stay separate so a comparable is never presented as a receipt.

A small memory table, `recognition_memory`, stores only an object key, a shard, and counts of confirmed or corrected outcomes. It does not store names, emails, serials, photos, or free-text descriptions. Corrections stay inside the organization until a later job is allowed to promote a de-identified count.

The downloadable CSV is the carrier handoff for now. A provider that wants the file required on a policy, and delivered into its own system, is stored in `insurer_inquiries`. That connection is the paid piece. The inventory itself is free for the household or the business.
