# Governance: the 100proof file as a standard

The goal is a contents file that any carrier, adjuster, administrator, or auditor in any market can read the
same way and trust for the same reasons. That is a governance claim before it is a technology claim, so the
rules live here and the code answers to them.

## Principles

1. **Provenance before polish.** Every fact on a line says where it came from — camera, owner, receipt,
   comparable, or edit — and sources are kept apart, never blended into one confident number.
2. **Uncertainty is shown, not smoothed.** Unsettled counts and models are flagged, open items are exported
   as exceptions first, and the accuracy mark can only be earned by signals a reviewer can check.
3. **No decision we are not licensed to make.** The file prepares; the carrier decides coverage and payment.
4. **Estimates carry their date and basis.** A price without a priced-at date and an exact-or-comparable
   label is not a standard price.
5. **Corrections are visible.** Changes append to a per-line history and to `item_events`; nothing is
   silently overwritten. Saved versions are optimistic-locked.
6. **The standard is versioned.** Every file carries `STANDARD` (format, schema, accuracy-mark version,
   invariant set, compliance register date) so a reader in five years knows which rules wrote it.

## Auditability

- **Seal:** creating an inventory seals a SHA-256 over the record and the walkthrough; the hash travels with
  the file.
- **Trail:** line-level changes with before/after and source; model calls in `cost_ledger` (call, model, ok,
  latency, sizes — no content); invariants run over the finished file and their output is exported in
  `measures.checks`.
- **Access:** Supabase Auth, forced RLS by organization, private media behind one-hour signed links, no
  coordinates stored. Service-role access exists only in `apps/worker`.
- **Review:** a file can be re-checked at any time — invariants are deterministic and the harness
  (`pnpm --filter @100proof/web harness`) proves the mark, ranking, and scorer still behave.

## Change control

| Change kind | Required with it |
| --- | --- |
| Prompt, schema, or threshold (a "lever") | One hypothesis in `docs/EXPERIMENTS.md`, eval before/after, harness pass |
| Accuracy mark signals or tiers | Mark version bump in `lib/standard.ts`, harness cases for each tier, Information page wording |
| File format | Schema version bump, migration note for readers, export test in the harness |
| Compliance-driven wording or behaviour | Register row updated with the primary source (`docs/COMPLIANCE_REGISTER.md`) |
| Model version | Pinned version evaluated on the full case set; `Meta-Models:` trailer; build log |
| Pricing or depreciation rule | Receipt-delta evidence by category (aggregate only), eval value metrics |

## Roles

- **Owner (Steven):** approves commits, register changes, and any public accuracy statement.
- **Builder (agent):** one lever at a time, evidence in the PR, no invented approvals or figures.
- **Reviewer of a file (carrier/adjuster):** relies on provenance, marks, and exceptions; their corrections
  feed the research loop as labels (`docs/RESEARCH_LOOP.md`).

## What "gold standard" means here, concretely

A file from any home, in any market, that states what is owned, what the evidence is, what it would cost to
replace like kind and quality today, what it is worth after depreciation, what is still unproven, and which
version of which rules produced it — readable by a human and importable by a system, with nothing hidden
that a reviewer would have wanted to know. Anything less is a list; this is the record.
