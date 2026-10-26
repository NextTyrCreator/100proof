## Plan
<!-- Written before code. What this PR delivers, in 2–4 sentences. Link the ADR if a decision is involved. -->

## Changes
<!-- One bullet per logical change. -->
-

## Meta models used
<!-- Model IDs called by this change: sam-3.1, muse-spark-1.3, muse-wonder-1.0, muse-image-1.0, meta-models/muse-spark-open-1026 -->
-

## Security and performance checklist (docs/ENGINEERING_STANDARDS.md §7)
- [ ] RLS policy on every new table; cross-tenant test passes
- [ ] Parameterized queries only; zod at every boundary incl. model outputs
- [ ] New secrets registered in `docs/ENV_VARIABLES.md`; none under `NEXT_PUBLIC_`
- [ ] Hot queries indexed, `EXPLAIN ANALYZE` in `docs/HOT_QUERIES.md`; no N+1; keyset pagination on new lists
- [ ] Rarely-changing data cached; images via `next/image` (AVIF/WebP, lazy below fold)
- [ ] Heavy components dynamically imported; `size-limit` and `knip` green
- [ ] Third-party scripts after interactive and behind `ConsentGate`
- [ ] Skeleton/Suspense on new routes; Profiler run on interactive screens
- [ ] Heavy work in Inngest; per-user concurrency respected
- [ ] Lighthouse before/after attached for page changes: `perf/<before>.json`, `perf/<after>.json`

## Verification
- [ ] Typecheck, lint, tests green locally
- [ ] Eval harness run on the sample set (recall table attached if capture/valuation changed)
- [ ] Manual run on preview: <url>

## Document tracking
- [ ] `docs/BUILT_DURING_HACKATHON.md` updated
- [ ] `CHANGELOG.md` (Unreleased) updated
- [ ] ADR added/updated if a decision changed
- [ ] `legal/DATA_INVENTORY.md` + `legal/PRIVACY_POLICY.md` updated if a new tool touches user data

## Approval
Commit-via-AI: <tool> (<model>) | none
Approved-by: Steven Blackburn on YYYY-MM-DD
