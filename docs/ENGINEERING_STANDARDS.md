# Engineering standards

These are the rules every PR is reviewed against. They exist because 100proof will hold video of people's homes, their purchase history and mailbox access, for both residential and commercial customers, and because many users will run the same heavy pipeline at once. "It works" is the floor; "it is safe and fast for every user at the same time" is the bar.

Each rule has an owner (the PR author), a check (what CI or the reviewer verifies) and, where useful, the reason. The PR template carries the short checklist; this document is the reference.

## 1. Security

### 1.1 Authentication and sessions
- **Supabase Auth** is the only identity provider: email magic link and Google (OAuth with PKCE). No password storage in our code, ever.
- Sessions are carried in **HttpOnly, Secure, SameSite=Lax cookies** set by `@supabase/ssr`; never in `localStorage`.
- Every server entry point (route handler, server action, Inngest function) **verifies the JWT server-side** against the project's JWKS (asymmetric, `ES256`/`RS256`) or via `supabase.auth.getUser()`; it never trusts `getSession()` claims from the client. Access tokens are short-lived (1 h); refresh tokens rotate and are revoked on sign-out.
- The **service-role key exists only in the worker's environment** and in server-only code paths. Any variable prefixed `NEXT_PUBLIC_` is treated as public; CI fails if the service-role key, a signing secret or an OAuth client secret appears under that prefix.
- Commercial tenancy from day 1: every table carries `org_id`; a personal account is an org of one. Roles (`owner`, `member`, `viewer`) live in `org_members`.

### 1.2 Authorization: Row Level Security on every table
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on every table in a migration, with policies keyed by `auth.uid()` through `org_members`. A table without a policy is a CI failure (`scripts/check-rls.sql` runs against the Supabase branch).
- Storage buckets are **private**; access is through signed URLs with ≤ 15-minute expiry for reads and single-use signed upload URLs for writes. Bucket policies deny `UPDATE` and `DELETE` on `videos/` for every role except the service role (evidence immutability).
- The worker, which uses the service-role key, **always scopes queries by `org_id` explicitly** and has an integration test that attempts a cross-tenant read and must fail.
- Postgres functions are `SECURITY INVOKER` unless an ADR says otherwise; `search_path` is pinned.

### 1.3 SQL injection and input validation
- **Parameterized queries only.** Drizzle query builder or the `sql` tagged template with bound values. String concatenation into SQL is a CI failure (eslint rule `no-restricted-syntax` on template literals passed to `sql.raw`, plus a grep in CI).
- Every boundary validates with **zod**: route handler bodies, search params, server-action arguments, job payloads, webhook payloads, and **every model output** (Spark/Wonder structured output is parsed with the schema before it touches the database; a parse failure is a retry, never a write).
- Numeric IDs are never exposed; primary keys are ULIDs/UUIDs. Lookups by `slug`/`token` go through constant-time comparison.

### 1.4 Secrets, signing and tokens
- Secrets live in Fly and GitHub Actions secrets and in the protected register Steven keeps outside the repo. `.env.example` lists every variable; `docs/ENV_VARIABLES.md` documents each one. A new variable without a register entry fails review.
- **Share links** (`/p/<token>`): token = random 256-bit value stored hashed (SHA-256) with `expires_at`, `recipient`, `max_views`; the URL carries the raw token once. Revoking deletes the hash. Packet renders are keyed to the token so revocation also invalidates the stored render.
- **Integrity hashes**: SHA-256 over canonical JSON (sorted keys, fixed number formatting) for scans, masters and packets; audit rows carry `prev_hash` (hash chain). `UPDATE`/`DELETE` are revoked on `audit_log` for all roles.
- **OAuth tokens** (Gmail, Drive): encrypted at rest with AES-256-GCM using a per-user data key wrapped by `TOKEN_MASTER_KEY` (envelope encryption); decrypted only in the worker, never logged, revoked at the provider on disconnect. Scopes are the narrowest that work (`gmail.readonly`, `drive.readonly`).
- Key rotation procedure documented in `docs/ENV_VARIABLES.md`; rotating `TOKEN_MASTER_KEY` re-wraps data keys without re-authorizing users.
- Webhooks (Inngest, Supabase) verify signatures; replay protection via timestamp + nonce.

### 1.5 Transport and browser hardening
- HTTPS only; **HSTS** with `includeSubDomains; preload`; TLS 1.2 minimum (Fly defaults).
- Security headers set in `next.config` middleware: strict **CSP** with nonces (no `unsafe-inline` for scripts), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` granting `camera=(self)` and `microphone=(self)` only on the capture route, `X-Content-Type-Options: nosniff`.
- CSRF: server actions use SameSite cookies plus an Origin check; state-changing route handlers require the same.
- The packet viewer (`/p/*`) and `/verify` run on the same origin but with a **read-only Supabase client** and no cookies required.

### 1.6 Uploads and media
- Browser uploads go **directly to Supabase Storage** with a signed URL (never through the Next.js server); size cap 500 MB; accepted types `video/mp4`, `video/quicktime`, image types; server-side `ffprobe`/`sharp` validation before processing; files that fail validation are deleted and the event logged.
- Originals are stored once, hashed, and never modified; derived frames, crops, WebP/AVIF renders go to separate prefixes.
- Faces detected in evidence frames are blurred in any shared render; raw frames are never in a public URL.

### 1.7 Rate limiting and abuse
- Per-user and per-IP limits (Upstash Ratelimit or Supabase Edge) on auth endpoints, upload-URL issuance, question answers, share-link creation and `/verify`. Defaults: 10 uploads/day/user, 60 req/min/IP on API routes.
- A **model-call budget per user per day** (dollars, from `meta-client` cost accounting); exceeding it pauses the pipeline and notifies the user rather than silently charging.

### 1.8 AI-specific controls
- All text from emails, PDFs, OCR, narration and model outputs is **data, never instructions**: wrapped in delimited blocks with an explicit instruction that it is untrusted; tool access is allow-listed per agent; no model output is executed or used to build a query without schema validation.
- Model API key is in **Standard mode** (no training on our content). No Contributor-mode keys anywhere.
- No real user data in prompts committed to the repo or in evaluation fixtures.

### 1.9 Logging and audit
- Structured JSON logs with request IDs; **no PII, tokens, video URLs or receipt contents in logs**. Sentry scrubs the same fields (`beforeSend`).
- `audit_log` is append-only and records: who, what, which object, hash before/after, when (server UTC), from where (IP class, not raw IP).

### 1.10 Dependencies and supply chain
- `pnpm-lock.yaml` committed; `pnpm audit --prod` and license check in CI; Dependabot weekly; secret scanning with push protection on the repo; container images signed (cosign) post-hackathon.

## 2. Performance

### 2.1 Budgets (fail the PR if exceeded on the demo routes)
| Metric | Budget | Where measured |
| --- | --- | --- |
| LCP | < 2.0 s (4G, mid-tier phone) | Lighthouse CI |
| INP | < 200 ms | Lighthouse CI |
| CLS | < 0.1 | Lighthouse CI |
| JS per route (gz) | < 170 KB initial | `size-limit` in CI |
| API p95 (non-model) | < 300 ms | Fly logs |
| Time to first item on screen after upload | < 20 s | Worker metric |
| Full 90 s scan to reviewable list | < 3 min | Worker metric |

`scripts/perf/measure.sh` runs Lighthouse against a URL and writes `perf/<date>-<label>.json`; every PR that touches a page attaches a **before and after** run in its Verification section.

### 2.2 Database: indexes, N+1, pagination
- **Index every column used in `WHERE`, `JOIN`, `ORDER BY` of a hot query**, and composite indexes in query order (`(org_id, created_at DESC)`, `(scan_id, confidence)`), partial indexes for status filters. Hot queries are listed in `docs/HOT_QUERIES.md` with their `EXPLAIN ANALYZE`; a new hot query without an index and a plan is a review failure. `pg_stat_statements` is reviewed weekly.
- **No N+1.** Lists load their children with a join or a single `IN (...)` batch; the worker uses a dataloader pattern for item → evidence → frames. The reviewer asks for the query count of any new list page (Drizzle logger in dev).
- **Every list that can grow is paginated server-side with keyset (cursor) pagination**, page size 50, and the UI uses infinite scroll or pages; `OFFSET` pagination is not used. Applies to scans, items, evidence, packets, audit rows, agent runs.
- pgvector queries use an HNSW index and a `LIMIT`.
- Transactions are short; long work is a job (§2.6).

### 2.3 Caching
- Rarely-changing data (insurance special-limit tables, category taxonomy, depreciation tables, the coming-soon page) is cached with Next's data cache / `unstable_cache` and tagged for revalidation on deploy; static pages use ISR.
- Hashed static assets ship with `Cache-Control: public, max-age=31536000, immutable`; HTML with `no-store` or short `s-maxage` + `stale-while-revalidate`.
- Client data uses SWR with stable keys; model results are memoized by content hash (same frame bytes → same SAM/Spark result, cached in Postgres) so re-runs and re-shoots never pay twice.

### 2.4 Images and media
- All UI images go through `next/image` with `sizes` set and **AVIF/WebP** output; anything below the fold is `loading="lazy"`; the hero/LCP image uses `priority`.
- The worker's `sharp` pipeline emits WebP thumbnails at 320/640/1280 and AVIF where the client accepts it; evidence crops for the UI are ≤ 100 KB; originals are untouched.
- Video is never autoplayed above the fold on first load; the player is a dynamic import.

### 2.5 JavaScript, bundles and rendering
- App Router server components by default; client components only where interaction requires it.
- **Route-level code splitting** is the baseline; heavy components (video player, PDF viewer, charts, mask overlay canvas) are `next/dynamic` with a skeleton fallback. `optimizePackageImports` for icon and UI libraries; no barrel re-exports in `packages/ui`.
- `size-limit` runs in CI per route; `@next/bundle-analyzer` report attached when a PR grows a route by > 10 KB.
- **Dead code and unused packages are removed**: `knip` runs in CI and fails on unused files, exports and dependencies; `pnpm dedupe` in the lockfile.
- **Third-party scripts load after the page is usable**: `next/script` with `strategy="lazyOnload"` for analytics, `afterInteractive` only when a feature needs it, and never before cookie consent in the EU (see `legal/COOKIES.md`).
- **No needless re-renders**: lists are keyed stably; expensive children are `memo`'d; derived values use `useMemo`; callbacks passed to memoized children use `useCallback`; client state uses Zustand with selectors so a change in one slice does not re-render unrelated components. The React Profiler is run on the scan review screen before merge and the result noted in the PR.
- **Loading skeletons** on every route (`loading.tsx`) and Suspense boundaries around every data read, so navigation feels instant; streaming is enabled.

### 2.6 Background jobs and agents
- Anything that takes > 300 ms, calls a Meta model, touches ffmpeg or reads a mailbox runs as an **Inngest function**, never in a request. Steps are idempotent and retried; results stream to the UI via Supabase Realtime.
- **Per-user concurrency** of one scan at a time (`concurrency: { key: "event.data.userId", limit: 1 }`) and a global cap so one user cannot starve others; priority for interactive steps (question answers) over nightly agents.
- Household agents (Muse Wonder) are jobs too: reconciler, re-pricer, change detector, packet builder; each run is logged with inputs, tool calls, outputs and a hash.
- Frame sampling is adaptive (2 fps keyframes, full rate only on dense segments) so per-scan cost and time stay flat as users grow.

### 2.7 CDN and static files
- `apps/web` and `/_next/static` are served by the Fly app; Supabase Storage holds originals; the worker's `sharp` pipeline makes thumbnails (Supabase Free has no image transforms); the coming-soon root is fully static.

### 2.8 Measurement
- `/health` checks each Meta model, Supabase, and Inngest; Sentry performance traces on the scan pipeline. Web Vitals are measured with Lighthouse, not a hosted analytics vendor.
- `scripts/perf/measure.sh <url> <label>` before and after any page change; the two JSON files are referenced in the PR.

## 3. Data
- Evidence (video, frames, masks, receipts) is immutable once sealed; corrections create new versions that reference the prior one.
- Retention: user-controlled; deletion is a tombstone plus hard delete of media within 30 days; the audit log keeps hashes only.
- Backups: the hackathon stays on Supabase Free, which has no PITR (ADR 0005). Migrations are forward-only and reviewed; destructive migrations need an ADR. Do not upgrade to Pro to turn PITR on for the demo.
- Synthetic data only in `samples/`, fixtures and the public demo.

## 4. Observability
- Sentry (errors + traces, PII scrubbed, session replay **off**), structured logs, `/health`, cost meter per scan, alerts on error rate and queue depth.

## 5. Accuracy
- The eval harness (`apps/worker/eval`) runs on every PR touching capture or valuation; recall per category must stay ≥ 95% on the sample set; fabrication checks (serial/price/order ID present without source) must be zero.

## 6. Not yet (post-hackathon)
SOC 2 program, third-party penetration test, object-lock storage, RFC 3161 timestamping, signed container images, formal retention schedule, DPA templates for commercial customers.

## 7. PR checklist (mirrored in the template)
- [ ] RLS policy on every new table; cross-tenant test passes
- [ ] Parameterized queries only; zod at every boundary incl. model outputs
- [ ] New secrets registered in `docs/ENV_VARIABLES.md`; none under `NEXT_PUBLIC_`
- [ ] Hot queries indexed with `EXPLAIN ANALYZE` attached; no N+1; keyset pagination on new lists
- [ ] Rarely-changing data cached; images via `next/image` (AVIF/WebP, lazy below fold)
- [ ] Heavy components dynamically imported; `size-limit` green; `knip` green
- [ ] Third-party scripts after interactive and behind consent
- [ ] Skeleton/Suspense on new routes; Profiler run on interactive screens
- [ ] Heavy work moved to Inngest; per-user concurrency respected
- [ ] Lighthouse before/after attached for page changes
- [ ] Privacy Policy / Data Inventory updated for any new data-touching tool
