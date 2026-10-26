# ADR 0003: AI tooling attribution in commits

Date: 2026-10-26 · Status: Accepted · Approved-by: Steven Blackburn

## Context
Three tools will write code in this repository: Muse Code (Meta's coding agent), Claude Code, and Cursor. The hackathon rules require that judges can identify what was built and how; we also want to show, honestly, which model produced each change and that a human approved it.

## Decision
Every AI-authored or AI-assisted commit carries `Commit-via-AI: <tool> (<model>)`, for example `Cursor (Claude Fable 5.1)`, `Cursor (Muse Spark 1.3)`, `Muse Code (Muse Wonder)`, `Claude Code (Claude Fable 5.1)`. The model name is the one selected in the tool at the time of the change. Every commit landing on `dev`/`main` also carries `Approved-by: Steven Blackburn on YYYY-MM-DD`. Tool-emitted trailers (e.g. `Co-Authored-By`) are kept. Each tool is configured to emit the format: Cursor via `.cursor/rules/100proof.mdc`, Claude Code and Muse Code via `AGENTS.md` / `CLAUDE.md`. `docs/BUILT_DURING_HACKATHON.md` has an "AI tooling" column per feature.

## Consequences
The history is an honest record of human and AI contribution. A commit with the wrong trailer is rejected by commitlint; a squash merge keeps the trailers because the PR body is used as the squash message.
