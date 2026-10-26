# Security policy

100proof holds video of people's homes, their purchase history and read-only access to their mailbox. We treat every report seriously.

## Reporting a vulnerability
Open a private report via GitHub Security Advisories on this repository (Security → Report a vulnerability). Do not open a public issue. Include steps to reproduce and the impact you believe it has. You will get an acknowledgement within 48 hours.

## What we do
See `docs/ENGINEERING_STANDARDS.md` §1 for the controls: Supabase Auth with server-verified JWTs, Row Level Security on every table, parameterized queries only, encrypted OAuth tokens, signed and expiring share links, strict CSP and security headers, rate limits, append-only audit log, secret scanning and dependency audits in CI.

## What we do not claim yet
No SOC 2, no third-party penetration test, no formal retention policy. These are listed as post-hackathon work in `docs/ENGINEERING_STANDARDS.md` §6.
