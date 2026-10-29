/**
 * Versions that make a 100proof file auditable. Bump the mark version when the signals or tiers change,
 * the schema version when the file shape changes, and the register date when docs/COMPLIANCE_REGISTER.md
 * is reviewed. Old files keep the versions they were written with.
 */
export const STANDARD = {
  fileFormat: "100proof.inventory",
  schemaVersion: 2,
  accuracyMarkVersion: 2,
  invariantSetVersion: 2,
  complianceRegister: "2026-10-29",
  valuationMethod: "Replacement cost, like kind and quality at local prices; actual cash value less physical depreciation.",
} as const;
