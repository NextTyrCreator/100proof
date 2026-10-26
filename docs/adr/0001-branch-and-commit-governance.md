# ADR 0001: Branch model and commit governance

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
The repository is the primary artifact judges use to verify the work was built during the hackathon and built with care. AI coding tools will author most commits, so human approval and tool attribution must be visible in the history itself.

## Decision
`main` (release, tagged) ← `dev` (integration) ← `ws/<workstream>/<topic>` (short-lived). Feature PRs squash into `dev`; `dev` merges into `main` at least daily with a merge commit. Conventional Commits with required trailers (`Approved-by`, `Commit-via-AI: <tool> (<model>)`, `Meta-Models`), enforced by commitlint locally and in CI. Every PR opens as a draft with its Plan written before code. `docs/BUILT_DURING_HACKATHON.md`, `CHANGELOG.md`, ADRs, the env register and the data inventory are updated in the same PR as the change.

## Consequences
History reads as a build log; `git log --format='%s%n%(trailers)'` reproduces the contribution index. More ceremony per commit, accepted for a judged repository.
