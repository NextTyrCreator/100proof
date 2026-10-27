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

## Not built during the hackathon (for clarity)
- Pre-event planning: `ARCHITECTURE.md` (written Oct 26 before kickoff). No code.
- Third-party libraries: see `package.json` and `pnpm licenses list`.
- Sample media in `samples/`: staged rooms recorded by Steven Blackburn during the event; synthetic receipts generated during the event.
