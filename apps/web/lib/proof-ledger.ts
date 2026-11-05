import type { RoomItem, RoomShard } from "./inventory";
import { lineConfidence } from "./line-confidence";

/**
 * The proof ledger. The inventory total split by what backs each line, read from the line's one
 * confidence number. "Counted" is the first two bands: a receipt or a documented appraisal, or seen and
 * at the bar for its price (75% under $250, 85% above). It describes the evidence on the line. It is
 * not a promise of what a policy pays.
 */
type Band = "receipt" | "identified" | "estimated" | "stated";

export const BAND_LABELS: Record<Band, string> = {
  receipt: "Receipt or appraisal",
  identified: "Seen and counted",
  estimated: "Seen, not counted yet",
  stated: "Stated, not seen",
};

/** Which band a line is in. Each line is in exactly one. */
export function bandOf(item: RoomItem): Band {
  const confidence = lineConfidence(item);
  if (confidence.tier === "appraised" || confidence.tier === "receipt") return "receipt";
  if (confidence.tier === "stated") return "stated";
  return confidence.assessed ? "identified" : "estimated";
}

export function proofLedger(rooms: RoomShard[]) {
  const totals: Record<Band, { usd: number; lines: number }> = {
    receipt: { usd: 0, lines: 0 },
    identified: { usd: 0, lines: 0 },
    estimated: { usd: 0, lines: 0 },
    stated: { usd: 0, lines: 0 },
  };
  for (const item of rooms.flatMap((room) => room.items)) {
    if (item.hidden) continue;
    const band = totals[bandOf(item)];
    band.usd += (item.priceUsd ?? 0) * item.count;
    band.lines += 1;
  }
  const total = totals.receipt.usd + totals.identified.usd + totals.estimated.usd + totals.stated.usd;
  const proven = totals.receipt.usd + totals.identified.usd;
  return { bands: totals, total, proven, provenShare: total > 0 ? proven / total : 0 };
}
