# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Changed
- The first screen leads with underinsurance: a 100-second verifiable inventory, labeled loss estimates, and a 95% review goal aimed at 98%.
- The line under that headline is set in a regular weight, sized for a phone first and a desktop column that matches the form.
- “100 seconds and rest assured.” sits on one line, and the underline under “100 seconds” draws in once.
- The headline arrives one letter at a time, then “Don’t be like them,” then the rest of the screen.
- “Don’t be like them.” drops into a gap, then shakes once it lands. “100 seconds” and its underline use the navy of “Proof.” The email button keeps a smooth drift between two close blues, with a navy stroke.
- A signed-in header shows the account email and log out. Inventory is the only destination there. The scan and the insured steps live on the inventory screen. For providers stays on the signed-out screen.
- My inventory leads with four steps, then New scan. Step numbers are navy. A step takes a light highlight under the pointer. A scan that has not been saved stays off the list, and the page shows no inventory value until one exists. A saved inventory is a row with its picture, title, and the date it was created.
- Signed in, the home page is the inventory, titled “My inventory.” A new scan asks for a required title and the address of the insured property before the camera opens. Locate me compares one device reading with that address. Within a mile it checks; farther than a mile it keeps the distance. Create inventory seals a SHA-256 of that record and the walkthrough. Room items can be removed, not added by hand.
- A provider request confirms in place, with the reference number and the person who submitted it.
- Walkthrough length in the README, package description, and judging map is 100 seconds.
- A sign-in code lasts 10 minutes. The login screen shows the time left, and sending a new code clears the old one.

### Added
- Brand loading mark: the ring and check turn together, one rotation every 1.5 seconds, fading in and handing off to the next screen.
- Provider form asks only for a connection or more information. The page ends with a copyright line.
- Floor-plan background sits behind the page at 28% opacity.
- Email one-time-code login, a blank inventory, carrier reach-outs, and a static hackathon footer (ADR 0008).
- Demo walkthrough UI: live 100-second scan, inventory document, and download, email, or send. No coverage decision (ADR 0007).
- Brand lock: logo, palette, and motion tokens (ADR 0006).
- ADR 0005: Meta Model API, Supabase Free, and one Fly.io machine. Vercel, Baseten, and Modal are out.
- Repository governance: branch model, commit convention with AI-attribution and approval trailers, PR and issue templates, CODEOWNERS, commitlint, CI.
- Engineering standards (security, performance, data, observability) and performance budgets.
- Draft Privacy Policy, Terms of Service, cookie consent specification, data inventory, contact page content.
- Environment variable register and `.env.example`.
- ADRs 0001–0004.
