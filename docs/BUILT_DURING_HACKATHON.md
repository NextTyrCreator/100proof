# Built during the Meta Global AI Developer Hackathon

Event: Oct 26 – Nov 4, 2026. Everything in this repository was written during the event.
First commit: `9a51175c27debcef11a1f6770cdb8270d470d036` `2026-10-26T17:20:01Z`

2026-10-27 is the scaffolding day. The signed-in inventory and the walkthrough path are in place. Recognition and the rest of the product functions start after this.

Judges: this table is the index of original contributions. Each row links to the PR that introduced it. The commit trailers (`Commit-via-AI`, `Approved-by`, `Meta-Models`) carry the same record in `git log`.

| Date | Feature | PR | Meta models | AI tooling | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-26 | Repository governance, engineering standards, legal drafts, env register, CI | bootstrap on `main` | — | Cursor (Grok 4.7) | No product code yet. Landed before branch protection. |
| 2026-10-26 | Account boundary: NextTyrCreator only; Supabase Free + one Fly machine; no Vercel, Baseten, or Modal | this commit | — | Cursor (Grok 4.7) | ADR 0005 |
| 2026-10-26 | Logo, palette, and motion tokens | this commit | — | Cursor (Grok 4.7) | ADR 0006 |
| 2026-10-26 | Demo UI: live scan, inventory document, proof export | this commit | — | Cursor (Grok 4.7) | ADR 0007. Recognition is not wired. |
| 2026-10-26 | Email login, blank inventory, carrier inquiries, evidence note | this commit | — | Cursor (Grok 4.7) | ADR 0008. Meta key stays on the worker. |
| 2026-10-26 | Loading mark: ring and check rotate as one unit | this commit | — | Cursor (Grok 4.7) | Linear 1.5s loop. Fades use the brand ease. |
| 2026-10-27 | Signed-in inventory and walkthrough scaffolding | this commit | — | Cursor (Grok 4.7) | UI and the early scan path only. Recognition is not wired. |
| 2026-10-29 | Narration: browser WAV per clip, transcribed and attached to lines with clip times | evidence loop | Muse Voice Transcribe 1.0, Muse Spark 1.3 | Cursor (Grok 4.7, Claude Opus 5.5) | ADR 0009 |
| 2026-10-29 | Lines say whether count and model are settled; ranked evidence requests, live during filming | evidence loop | Muse Spark 1.3 | Cursor (Grok 4.7, Claude Opus 5.5) | ADR 0009 |
| 2026-10-29 | Label, receipt, picture, and answer checks; focused clip; change log per line; item record by source | evidence loop | Muse Spark 1.3 | Cursor (Grok 4.7, Claude Opus 5.5) | Replaces the photo-only route |
| 2026-10-29 | Saved inventories in Supabase: `inventories`, `item_events`, `cost_ledger`, private `evidence` bucket, forced RLS | evidence loop | — | Cursor (Grok 4.7, Claude Opus 5.5) | Two migrations, applied to 100proof-dev |
| 2026-10-29 | Still-open queue, JSON claim file v1 with exceptions, CSV sources | evidence loop | — | Cursor (Claude Opus 5.5) | |
| 2026-10-29 | Guided-versus-unguided eval harness and scorer | evidence loop | Muse Spark 1.3, Muse Voice Transcribe 1.0 | Cursor (Claude Opus 5.5) | `docs/EVAL.md`; no case run yet |
| 2026-10-29 | Every load opens on For insured; public Information page with FAQ and app markup, search research, answer bots allowed, `llms.txt` rewritten | information | — | Cursor (Claude Opus 5.5) | `docs/GTM.md` search section |
| 2026-10-29 | Measures per inventory: document measures, model calls from `cost_ledger`, in the summary and the claim file; live test checklist | measures | — | Cursor (Claude Opus 5.5) | `cost_ledger_inventory_idx` applied to 100proof-dev |

## Not built during the hackathon (for clarity)
- Pre-event planning: `ARCHITECTURE.md` (written Oct 26 before kickoff). No code.
- Third-party libraries: see `package.json` and `pnpm licenses list`.
- Sample media in `samples/`: staged rooms recorded by Steven Blackburn during the event; synthetic receipts generated during the event.
