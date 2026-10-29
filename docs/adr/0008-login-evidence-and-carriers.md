# ADR 0008: Email login, carrier evidence, and recognition memory

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
The inventory has to be tied to a person before a scan or the inventory can be opened. A password is the wrong first step. Carriers need a file they can pick up, and they are the buyer if the inventory is free for the household or the business. Meta's brand rules do not allow the Meta logo, or a line that implies Meta certified the inventory, without written approval.

## Decision
Login is an email and a one-time code through Supabase Auth. The home screen is that login until a session exists. Scan and inventory routes stay closed without a session.

A code lasts 10 minutes. Asking for another code for the same email replaces that code: the previous one stops working when the new email is sent. A new code can be sent once a minute and five times an hour for that address. Five wrong codes pause further tries for 15 minutes. The code itself is not stored in the app. Closing the tab returns to the code box for the code that is still current.

The footer uses the 100proof mark and states that the project is entered in the Meta Global AI Developer Hackathon 2026 and calls named Meta models. It does not use the Meta logo and it does not say Meta certified the result.

The inventory starts empty. A person can record a walkthrough or add an item with a description, a price, a picture, and a source file. The source video can be downloaded to the device. The document does not decide coverage.

Insurer reach-outs are stored in `insurer_inquiries`, behind a checked function, on the 100proof organization. Each future provider connection is its own record. The household inventory stays free. The provider pays for the connection into its system.

`recognition_memory` keeps de-identified counts only: an object key, one of eight shards, a confidence band (`certain` at 90% or above, otherwise `review`), and confirmed or corrected counts. No names, emails, serials, or photos.

## Consequences
The Meta API key stays off the browser. The review route on the web server reads `META_MODEL_API_KEY` and calls `packages/meta-client`. The same variable is the one the worker will use when that job moves to Inngest. It is never a `NEXT_PUBLIC_` variable.

This note does not mean the file satisfies every insurance statute. `docs/EVIDENCE_FOR_CARRIERS.md` lists the form language and the complaints the columns are built to answer.
