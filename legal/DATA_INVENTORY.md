# Data inventory: every tool that touches user data

Updated in the same PR that adds, removes or reconfigures a tool. This table feeds the Privacy Policy sub-processor list.

| Tool | Purpose | Data it receives | Region | Transfer basis (EU) | Status |
| --- | --- | --- | --- | --- | --- |
| Supabase | Postgres, Storage, Auth | Account data, inventory records, video/frames/crops, receipts metadata, encrypted OAuth tokens | US | SCCs | Active (Free plan) |
| Fly.io | Web app and worker hosting | Request logs (IP, UA) | US (`iad`) | SCCs | Active |
| Meta Model API (Meta Platforms) | SAM 3.1, Muse Spark, Muse Wonder, Muse Image, Voice Transcribe, receipt parsing | Video, frames, crops, receipt text, narration audio, prompts; Standard mode (no training) | US | SCCs/DPF | Active |
| Inngest | Background jobs | Job payload metadata (IDs, timestamps), never media | US | SCCs | Active |
| Sentry | Error and performance monitoring | Stack traces, request IDs; PII scrubbed; session replay OFF | US | DPF | Active |
| Google (OAuth, Gmail API, Drive API) | Sign-in; read-only receipt search | Google account ID, matched message IDs and parsed receipt fields | US | DPF | Active (user-initiated) |
| Resend | Transactional email | Email address, message content (magic links, notices) | US | SCCs | Active |
| Upstash | Rate limiting | Hashed IP / user ID counters | US | SCCs | Active |
| Stripe | Payments | None in hackathon build | — | — | Not used |
| Session replay (any vendor) | — | — | — | — | Not used, by policy |
| Advertising / tracking pixels | — | — | — | — | Not used, by policy |
