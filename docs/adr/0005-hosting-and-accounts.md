# ADR 0005: Hosting and which accounts exist

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
The hackathon demo needs a public web app, a worker that can run ffmpeg, Postgres, auth, and private video storage. Vercel Pro is $20/month plus overage, and the free Hobby plan pauses after 4 CPU-hours or 10 GB of origin transfer, which a video pipeline will hit. Fly.io has no ongoing free tier for a new organization; the smallest useful always-on machine is the cost. Baseten and Modal were only in the plan for an open-weight bonus stage and a post-demo private mode.

## Decision
Accounts for this build:

- Meta Model API, Standard mode, on the Meta developer account. One key. Spend limit on. Receipt parsing, naming, agents, and catalog shots all go through this key.
- Supabase Free ($0): Postgres, Auth, Storage. US region. Stay on Free through judging. No Pro upgrade for PITR or image transforms. The project pauses after a week idle, so it must see traffic through Nov 16.
- Fly.io: one app in Ashburn (`iad`), `shared-cpu-1x` with 1 GB RAM (about $6.70 per 30 days). Web and worker run on that machine. Shared IPv4 and IPv6, no dedicated address. Domains `100proof.tech` and `demo.100proof.tech` point here.
- GitHub: `NextTyrCreator/100proof` only.

Not in this build: Vercel, Baseten, Modal, Stripe. Inngest, Google OAuth, Sentry, Resend, and Upstash wait until the feature that needs them, and only on a free tier.

## Consequences
One paid host, capped at a single small machine. Video uploads go direct to Supabase Storage (1 GB on Free), so the app host does not proxy the bytes. Thumbnails are made with `sharp` in the worker. Receipt parsing uses Muse Spark 1.3 on the Meta key. The open-weight bonus and on-device Glimmer are out. ADR 0002 still names Supabase; for the hackathon that means the Free plan, so PITR waits.
