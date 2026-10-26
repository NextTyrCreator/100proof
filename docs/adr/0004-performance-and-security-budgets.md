# ADR 0004: Performance budgets and security baseline are merge gates

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
Many users will run the same heavy pipeline concurrently, and the product holds sensitive household data for residential and commercial customers. Performance and security regressions are cheapest to stop at the PR.

## Decision
`docs/ENGINEERING_STANDARDS.md` is the reference; its §7 checklist is in the PR template; CI enforces what it can (commitlint, knip, size-limit, license check, secret-prefix grep, RLS check, Lighthouse CI budgets on demo routes). Budgets: LCP < 2.0 s, INP < 200 ms, CLS < 0.1, < 170 KB JS per route, API p95 < 300 ms, first item on screen < 20 s after upload, full scan < 3 min. Heavy work runs in Inngest with per-user concurrency of 1.

## Consequences
A page change ships with before/after Lighthouse JSON; a new query ships with its index and plan; a new tool ships with its data-inventory row. Slower to merge, faster and safer for every user.
