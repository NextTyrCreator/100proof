# Compliance register

The rules 100proof's wording, valuation, and data handling follow, by jurisdiction. This is an engineering
register, not legal advice. Each row names the source, what we do because of it, and when it was last checked.
A row is only updated with the source in hand, in the same PR as any wording or behaviour it changes
(`docs/ENGINEERING_STANDARDS.md`). Register version: 2026-10-29 (also in `apps/web/lib/standard.ts`).

## Valuation and claims conduct

| Jurisdiction | Source | What it requires | What 100proof does | Checked |
| --- | --- | --- | --- | --- |
| United States (general) | NAIC, A Consumer's Guide to Home Insurance; NAIC home inventory guidance | Inventory room by room with photos or video; store it away from the home; update yearly | The product is that workflow; the Information page says so and says we are not an NAIC program | 2026-10-29 |
| California | Cal. Ins. Code §2051 (ACV), §2051.5 (replacement cost); CDI disaster adjusting guide | ACV is replacement less fair physical depreciation for age, condition, useful life; replacement is like kind and quality at current prices | Both figures shown per line with the basis; depreciation note states age and life used | 2026-10-29 |
| California | CDI, 14 Feb 2025 wildfire release | Carriers asked to advance ≥75% of contents limits without an inventory; the remainder needs a list | Cited exactly as an advance, never as a payout rate | 2026-10-29 |
| Texas | TDI, A home inventory; home insurance guide | A missing inventory can delay a contents claim; a phone video is a valid start | Cited as TDI guidance; not presented as a TDI program | 2026-10-29 |
| Iowa (pattern for all states) | Iowa Insurance Division, guidance for contractors and public adjusters; NAPIA UPPA summaries | Only licensed public adjusters or attorneys may represent the insured, interpret coverage, or negotiate; wording that implies adjusting should be removed, with a disclaimer | 100proof never calls itself an adjuster, never predicts what an insurer will pay, and carries the not-an-adjuster statement on the Information page and in every export | 2026-10-29 |
| All markets | Carrier policy language (typical) | Coverage, limits, deductibles, and settlement basis are set by the policy | Every surface says the carrier decides; the claim file carries the same notice | 2026-10-29 |

## Privacy and data

| Jurisdiction | Source | What 100proof does | Checked |
| --- | --- | --- | --- |
| United States | State privacy laws (CCPA/CPRA pattern) | No sale of personal data; private storage; signed links expire in an hour; only the within-1-mile result is kept, never coordinates | 2026-10-29 |
| European Union / UK | GDPR / UK GDPR principles | Lawful basis recorded per data type in `legal/PRIVACY_POLICY.md`; data inventory in `legal/DATA_INVENTORY.md`; export and deletion are product features to complete before any EU/UK launch | 2026-10-29 |
| Canada | PIPEDA principles | Consent, purpose limitation, and access follow the same inventory; provincial review required before launch | 2026-10-29 |
| Australia | Privacy Act principles | Same inventory and retention rules; local review required before launch | 2026-10-29 |

Rows for a market say "required before launch" until a named reviewer has checked them. The product does not
claim compliance in a market from this table alone.

## Update process

1. A regulator page, statute, model release, or guidance document changes, or a reviewer flags a row.
2. Read the primary source. Update the row, the register version date, and `STANDARD.complianceRegister`.
3. If the change affects wording, behaviour, or data handling, make that change in the same PR and note the
   row it answers to. Re-run the harness and the eval gate.
4. Record the change in `CHANGELOG.md` and, if it affects the file format or the mark, `docs/GOVERNANCE.md`.
