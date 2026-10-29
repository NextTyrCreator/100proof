# Go to market

Checked 2026-10-28. This is the record for the hook, the figures, the accuracy goals, and competitor claims. Update it when a source or a claim changes. Do not paste a figure onto the site until it is in this file with a source or an explicit “our estimate” label.

## Hook

Most people are underinsured. Don't be like them. Take a video. Get an automated inventory with verified proof, and insure it properly.

The name 100proof is the brand. It means a record you can show. It is not a timer, and it is not a claim that the list is 100% accurate. A session records up to 5 minutes, in 30-second clips. Do not write “in 100 seconds” as the product limit. Do not write “100% accurate,” “100% proof” as a measured score, or that 100proof decides coverage or binds a policy. The honest close is that the person uses the inventory to insure properly. The carrier still decides what the policy pays.

## Hackathon

Checked 2026-10-28 against the Meta and Cerebral Valley event page and the published waiver summary. Judges score the finished project, not the application.

| Weight | Criterion | What it asks | What 100proof shows |
| --- | --- | --- | --- |
| 30% | Impact | Who it helps, how much it matters, whether people would use it, and whether it fits a theme. | Build for Your World. Contents claims stall when there is no list. NAIC and Texas already tell people to film the rooms. The product does that job. |
| 25% | Meta AI tooling | Creative use, past a thin wrapper. | Muse Spark itemizes each 30-second clip, in order, then prices replacement from the zip and jurisdiction. The video is the input. The inventory is the output. |
| 25% | Demo | A working demo that holds up live, plus the demo video. | One path: film, pause, record, and the list appears from those clips in order. Say what the model does not decide. |
| 20% | Technical depth | Sound engineering, refined on purpose. | Clips stay small enough to review. Location is a range, not a published coordinate. The person keeps or corrects every line. |

Indie judging looks for creativity, ambition, and whether it works. Startup judging looks for execution and whether it would hold up in production. Large hackathons are usually won by one live loop a judge can follow, a problem with a source, and an honest limit. A long feature list loses to that loop. A demo video should be the same path: real video in, inventory out.

The line to say in the room: take a video of the property, get an automated inventory with verified proof, and insure it properly. The line not to say: the inventory is 100% accurate, or the policy is bound.

## Next plan

A technical product plan is coming in after this commit. Read it as a proposal. Keep the parts that make the record accurate enough that someone will pay for it, and that make the product likable enough to tell someone else about. Drop the parts that fight the product already built.

These stay:

- A session is 5 minutes. It is filmed in 30-second clips. The person can pause and record again until they are done, or until the session sits for 15 minutes.
- A photo snapped onto a line is sent through the same review and can reprice that line. A serial may identify the product. It is not placed in the price search.
- Another clip can be added to the same inventory. Clips are reviewed in the order they were filmed, and the lines are combined. The same object still in frame does not become a second row.
- The thing people pay for is the verification: property, equipment, and items, with the video kept beside the list. The carrier, buyer, or lender still decides what the record is worth. 100proof does not bind a policy and does not claim the list is 100% accurate.

Use the incoming plan to shape price, who pays, the campaign, and the go-to-market line. The campaign should make a person want to film the property because the inventory is something they can show. Likability is a short path: film, pause, see the list, correct a line, send it.

## What we say, and what we do not say

100proof helps a person document personal property, and commercial property, before a policy is bound and again at renewal. The video stays with the account. A spreadsheet of pictures does not.

State regulators and the NAIC already tell people to make that list. The Texas Department of Insurance says a missing inventory can delay a contents claim, and that a phone video of each room is a valid way to start. NAIC’s consumer guide says to go room by room, take pictures or video, store the inventory away from the house, and update it every year.

100proof is not an NAIC initiative, a TDI initiative, or a government program. Saying that it is would be false. The honest line is that the product does the job those offices already ask people to do.

100proof does not decide coverage, and it does not say what an insurer pays for the product.

“The only verifiable personal inventory tool” is not a claim we can defend. Other products record video, recognize objects, or seal a file. The defensible difference is a video the person films, reviewed into an inventory tied to the account, plus a correctness bar we measure on each reviewed scan.

## Accuracy goals

Two different numbers. Do not mix them.

| Bar | Meaning | Status |
| --- | --- | --- |
| 90% | A single item at or above this model score can be treated as recognized. Below it, the person names the item. | Product rule. Not an accuracy rate. |
| 95% | Minimum share of reviewed items kept without a correction on a scan. `kept / (kept + corrected)`. | Goal. Not a measured result. |
| 98% | The aim for that same ratio. | Goal. Not a measured result. |

No score is shown until a scan has at least one kept or corrected item. Typed items are not counted as recognition. The formula lives in `apps/web/lib/accuracy.ts`.

## Figures on the site

| Line | What it is | How to say it |
| --- | --- | --- |
| $3–7 billion a year, United States | 100proof’s conservative estimate of contents coverage people paid for and did not collect because it was not documented. | “Our estimate.” Not a government total. |
| $10–25 billion a year, worldwide | The same ratio applied to global insured property losses. | “An extrapolation.” Wider and less certain than the US number. |
| Los Angeles, 2025 | The California insurance commissioner asked carriers to advance at least 75% of contents limits without an inventory, and up to 100%. Many agreed to at least 75%. The rest of the limit still needed a list. | Do not say regulators found that insurers paid 75–80% because people could not itemize. The advance is what people received without a list. The unpaid remainder is the point. |

Sources checked 2026-10-27:

- NAIC, [A Consumer’s Guide to Home Insurance](https://content.naic.org/sites/default/files/publication-hoi-pp-consumer-homeowners.pdf).
- NAIC survey, February 2012: 59% had not inventoried possessions. [PR Newswire](https://www.prnewswire.com/news-releases/most-americans-havent-protected-their-possessions-from-severe-weather-threats-142446065.html). A “53%” figure was not in the sources checked. State pages still say “more than half,” often without a year.
- Texas Department of Insurance, [A home inventory](https://www.tdi.texas.gov/tips/home-inventory.html) and the [home insurance guide](https://www.tdi.texas.gov/pubs/consumer/cb025.html).
- California Department of Insurance, [14 February 2025 release](https://www.insurance.ca.gov/0400-news/0100-press-releases/2025/release014-2025.cfm) and the [6 February 2025 notice](https://www.insurance.ca.gov/0250-insurers/0300-insurers/0200-bulletins/bulletin-notices-commiss-opinion/upload/Notice-Re-Personal-Property-Insurance-Claims-for-2025-Los-Angeles-Wildfires.pdf).

Hold for a press quote until the primary PDF is in hand:

- Swiss Re sigma on 2025 natural-catastrophe losses (the pitch uses about $220 billion economic, $107 billion insured). The uninsured share is mostly uninsured property, not under-declared contents. It is a ceiling, not our number.
- Go.Compare / Insurance Edge, 2024: about £827 billion of UK household contents, about £276 billion uninsured, 9.3 million households with no contents policy, 5.6 million more homes probably underinsured.
- Insurance Council of Australia: about 30% of eligible households with no contents policy, and more than 80% of homeowners and renters who believe they may be underinsured.

## Competitor claims

Checked 2026-10-27. “No accuracy claim” means no public measured item-accuracy rate was found.

| Who | What they offer | Accuracy claim |
| --- | --- | --- |
| NAIC myHOME Scr.APP.book | Free photo, barcode, and serial inventory. NAIC and TDI point people to it. | None. |
| State Farm | Excel and PDF contents aids, and Claims Hub. The handler still checks quantity, age, and condition. | None. |
| HomeZada | Video and photo recognition. The homeowner confirms the list. | None on the launch page. |
| Bevel | AI inventory from photos and video after a loss. NerdWallet’s trial found a keyboard priced at $150 and a router named as a diffuser. | None. The trial is evidence of errors, not a rate. |
| WHIG | Narrated iPhone walkthrough and a sealed evidence package. The certificate does not cover value accuracy. | None. |
| Sortly, BluePlum, Nest Egg, Itemtopia | Catalogs a person types, with photos and an export. | None found. |
| Encircle | Public site is field documentation for restoration and claims work. | None found for consumer item accuracy. |

Insurers want a list they can settle. The tools they hand out today are mostly forms, spreadsheets, and photo apps. None of the products above publish a 95% or 98% correctness rate. That bar is ours to hit and to show per scan, not a slogan to put on the page early.

## Launch page and search

The first screen carries the hook, the two labeled money figures, the Los Angeles example, and the regulator line. There is no social account yet, so the page has to be the pitch.

Search is the visible words, the title, the description, `/llms.txt`, `/llm.txt`, `robots.txt`, and `sitemap.xml`. The phrases are personal property, personal property insurance, home inventory, renters insurance, homeowners insurance, commercial property, insuring property, and contents coverage. Ranking first is not something the page can promise. Hidden keyword lists would not earn it.

`/llms.txt` is the file assistants should read. `/llm.txt` points at it.
