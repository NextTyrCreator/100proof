# Environment variable register

Every variable the system reads, where it is used, whether it is a secret, and where the real value lives. Steven keeps the values in a protected register outside the repo; this file documents names and purpose only. A new variable is added here in the same PR that introduces it. Public variables (`NEXT_PUBLIC_*`) may never carry a secret; CI greps for known secret names under that prefix.

| Variable | Used by | Secret | Purpose | Rotation |
| --- | --- | --- | --- | --- |
| `META_MODEL_API_KEY` | worker | yes | Meta Model API (SAM 3.1, Muse Spark, Muse Wonder, Muse Image, Voice). Standard mode key. Receipt parsing uses this key. | Regenerate at dev.meta.ai; update Fly + GitHub secrets |
| `META_MODEL_API_BASE_URL` | worker | no | `https://api.meta.ai/v1` | n/a |
| `NEXT_PUBLIC_SUPABASE_URL` | web, worker | no | Supabase project URL | n/a |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | no (public, RLS-bound) | Browser client; RLS enforces access | Supabase → API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | worker only | yes | Bypasses RLS; worker scopes every query by org_id | Supabase → API settings; never in web |
| `SUPABASE_DB_URL` | worker, migrations | yes | Direct Postgres connection for Drizzle migrations | Supabase → Database |
| `SUPABASE_JWT_SECRET` or JWKS URL | web, worker | yes | Server-side JWT verification | Supabase → API settings |
| `TOKEN_MASTER_KEY` | worker | yes | Wraps per-user data keys that encrypt Gmail/Drive OAuth tokens (AES-256-GCM) | Generate 32 random bytes; re-wrap DEKs via `scripts/rotate-token-key` |
| `SHARE_TOKEN_PEPPER` | web | yes | Peppers share-token hashes | Rotate with a grace window |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | web | id no / secret yes | Google sign-in and Gmail/Drive read-only consent | Google Cloud Console |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | web, worker | yes | Job dispatch and webhook signature verification | Inngest dashboard |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | web, worker | url no / token yes | Rate limiting | Upstash console |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | web, worker | no | Error reporting (PII scrubbed, replay off) | Sentry |
| `SENTRY_AUTH_TOKEN` | CI | yes | Source map upload | Sentry |
| `RESEND_API_KEY` | web | yes | Transactional email (magic links fall back to Supabase SMTP) | Resend |
| `NEXT_PUBLIC_APP_URL` | web | no | `https://demo.100proof.tech` | n/a |
| `NEXT_PUBLIC_ROOT_URL` | web | no | `https://100proof.tech` | n/a |
| `COST_BUDGET_USD_PER_USER_PER_DAY` | worker | no | Model-call budget; default `5` | n/a |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | web | yes | Reserved; not used in the hackathon build | Stripe |

Rules: real values never in git; `.env.example` mirrors this table with placeholders; CI fails if `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_MASTER_KEY`, `*_SECRET` or `*_API_KEY` appear with a `NEXT_PUBLIC_` prefix anywhere in the tree.
