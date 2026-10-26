# Cookie and consent specification

100proof serves the US first and must work in the EU/UK. Consent handling is built in from day 1, not bolted on.

## Categories
| Category | Examples | EU/UK | US |
| --- | --- | --- | --- |
| Strictly necessary | Supabase auth session cookies, CSRF/origin token, consent record, rate-limit cookie, load balancing | No consent needed | No consent needed |
| Functional | Remembered room order, last-used language, draft question answers (localStorage) | Consent required | Notice |
| Analytics / performance | Vercel Speed Insights, Web Vitals, product analytics (if added) | Consent required; off by default | Notice + opt-out |
| Advertising | None. We do not run ads or ad trackers. | n/a | n/a |

## Behaviour
- Region is detected server-side from the `x-vercel-ip-country` header (EU/EEA/UK list in `packages/ui/consent/regions.ts`); unknown region is treated as EU.
- **EU/UK:** a banner with equal-weight "Accept all", "Reject all" and "Choose" is shown on first visit; no non-essential script loads until a choice is stored. "Reject all" is one click.
- **US:** a non-blocking notice with "Cookie settings" and an opt-out; non-essential scripts load after the page is interactive (`next/script` `lazyOnload`).
- **Global Privacy Control** (`Sec-GPC: 1`) is honored everywhere as an opt-out of analytics.
- The consent record (`consent_version`, categories, timestamp, region) is stored in a first-party cookie (12 months) and mirrored to the user's profile when signed in; changing the policy version re-prompts.
- The footer carries "Cookie settings" on every page; the privacy policy links to it.
- Third-party scripts are mounted only through `packages/ui/consent/ConsentGate` so a new script cannot bypass consent by accident.
