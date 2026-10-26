# Contributing to 100proof

This repository is the judged artifact for the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026). Every change is planned, reviewed, and traceable. These rules apply equally to humans and to AI coding tools (Muse Code, Claude Code, Cursor).

## Branch model

| Branch | Purpose | Protection |
| --- | --- | --- |
| `main` | Release branch. Only what is deployed to demo.100proof.tech. Tagged (`v0.1.0-hackathon`) at code freeze. | PR from `dev` only, 1 approval, CI green, no force-push, conversations resolved |
| `dev` | Integration branch. All feature work merges here first; deployed to a preview URL. | PR required, CI green, no force-push |
| `ws/<workstream>/<topic>` | Short-lived feature branches: `ws/capture/sam-prompt-loop`, `ws/valuation/receipt-match`, `ws/packet/verify-page`, `ws/agents/reconciler`, `ws/infra/supabase` | None; deleted after merge |
| `docs/<topic>` | Documentation-only changes | None |

Flow: `ws/*` → PR → `dev` (squash) → PR → `main` (merge commit, at least daily). Hotfixes branch from `main` and back-merge to `dev`.

## Every PR has a plan, written first

Open the PR as a draft with the **Plan** section filled in, then push commits. The template's sections are mandatory: Plan, Changes, Meta models used, Security and performance checklist, Verification, Document tracking, Approval. A PR missing any of them is not reviewed.

## Commit messages

Conventional Commits with a body and trailers. Subject ≤ 72 chars, imperative mood, one logical change per commit.

```
<type>(<scope>): <what changed, imperative>

<why it changed and what it enables; wrap at 80 cols>

Refs: #<issue or PR>
Meta-Models: sam-3.1, muse-spark-1.3
Commit-via-AI: Cursor (Claude Fable 5.1)
Approved-by: Steven Blackburn on 2026-10-26
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `infra`, `security`, `legal`.
Scopes: `capture`, `valuation`, `evidence`, `packet`, `agents`, `insurance`, `schema`, `meta-client`, `web`, `worker`, `infra`, `docs`, `legal`, `repo`.

### Trailers (the record judges will read)

| Trailer | Required | Format |
| --- | --- | --- |
| `Approved-by:` | Every commit that lands on `dev` or `main` | `Approved-by: Steven Blackburn on YYYY-MM-DD` |
| `Commit-via-AI:` | Every AI-authored or AI-assisted commit | `Commit-via-AI: <tool> (<model>)` — examples: `Muse Code (Muse Wonder)`, `Claude Code (Claude Fable 5.1)`, `Cursor (Claude Fable 5.1)`, `Cursor (Muse Spark 1.3)`. Omit only for commits typed by hand with no AI assistance. |
| `Meta-Models:` | Any commit that adds or changes a Meta model call | Comma-separated model IDs |
| `Co-Authored-By:` | Optional, tool-generated | Whatever the tool emits; keep it |
| `Refs:` | Any commit tied to an issue or PR | `Refs: #12` |

The tool name says *which editor or agent* produced the change; the model in parentheses says *which model* was driving it. Both are required because the hackathon asks us to show what was built, by what, and who approved it.

Set the template once per clone: `git config commit.template .gitmessage`. Messages are linted by commitlint in CI and locally by the `commit-msg` hook (`pnpm i` installs it). See `docs/adr/0003-ai-tooling-attribution.md` and `.cursor/rules/100proof.mdc` for how each tool is configured to emit this format.

## Security and performance are review criteria, not afterthoughts

Every PR is checked against `docs/ENGINEERING_STANDARDS.md`. The PR template carries the short checklist; the standards doc has the reasons and the exact rules (RLS on every table, parameterized queries only, index every hot query, no N+1, cursor pagination on every list, cache what rarely changes, WebP/AVIF images, route-level code splitting, third-party scripts after interactive, skeletons, Lighthouse before/after).

## Document tracking in the same PR

- `docs/BUILT_DURING_HACKATHON.md`: date, feature, PR, Meta models.
- `CHANGELOG.md`: `Unreleased` section, Keep a Changelog format.
- `docs/adr/NNNN-title.md`: any decision that changes a dependency, data model, model ID, security boundary or performance budget.
- `docs/ENV_VARIABLES.md`: any new environment variable, same PR.
- `legal/DATA_INVENTORY.md` and `legal/PRIVACY_POLICY.md`: any new tool that touches user data, same PR.

## Secrets and data

No secrets in the repo, ever. `.env.example` lists every variable with a placeholder; real values live in Fly and GitHub Actions secrets and in Steven's protected register. Demo and test data are synthetic; no real policyholder video, receipts or names. The only GitHub account is NextTyrCreator.

## Licenses

Apache-2.0. Every dependency must be compatible; `pnpm licenses list` runs in CI and the PR fails on GPL/AGPL/unknown.
