import { accuracyMark } from "./accuracy-mark";
import type { HomeInventory, RoomItem } from "./inventory";
import { CATEGORIES } from "./review-shape";

const KNOWN_CATEGORIES = new Set<string>(CATEGORIES);

/**
 * Outlier and consistency checks over a finished file. These do not change anything; they flag what a
 * reviewer should look at before the file is relied on. Run in the app (Measures), in the claim file,
 * and in the testing engine (`scripts/harness/run.ts`). A blocker means the file contradicts itself.
 */

type InvariantSeverity = "blocker" | "review" | "note";

type InvariantIssue = {
  severity: InvariantSeverity;
  code: string;
  itemId: string | null;
  message: string;
};

const STALE_PRICE_DAYS = 90;

function norm(text: string | null | undefined) {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function checkLines(items: RoomItem[], now = new Date()): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const push = (severity: InvariantSeverity, code: string, item: RoomItem | null, message: string) =>
    issues.push({ severity, code, itemId: item?.id ?? null, message });

  for (const item of items) {
    const name = item.name;
    if (item.cashValueUsd != null && item.priceUsd != null && item.cashValueUsd > item.priceUsd) {
      push("blocker", "cash-over-replacement", item, `${name}: cash value is above replacement cost.`);
    }
    if ((item.countSettled || item.identitySettled) && item.priceUsd == null && item.enteredBy !== "you") {
      push("review", "settled-no-price", item, `${name}: marked settled but has no price.`);
    }
    if (item.identitySettled && !item.brand && !item.markings && item.enteredBy !== "you") {
      push("review", "settled-no-identity", item, `${name}: identity marked settled with no brand or model recorded.`);
    }
    if (item.enteredBy === "scan" && item.sightings.length === 0) {
      push("review", "no-sighting", item, `${name}: from the scan but never tied to a moment in a clip.`);
    }
    if (item.options.length >= 2 && item.priceUsd != null) {
      const low = Math.min(...item.options.map((option) => option.lowUsd));
      const high = Math.max(...item.options.map((option) => option.highUsd));
      if (item.priceUsd > high * 1.5 || item.priceUsd < low * 0.5) {
        push("review", "price-outside-options", item, `${name}: price sits well outside the range of its possible models.`);
      }
    }
    if (item.grouped && item.priceUsd != null && item.priceUsd * item.count >= 500) {
      push("review", "grouped-high-total", item, `${name}: a grouped line worth checking item by item.`);
    }
    if (item.pricedAt) {
      const ageDays = (now.getTime() - Date.parse(item.pricedAt)) / 86_400_000;
      if (Number.isFinite(ageDays) && ageDays > STALE_PRICE_DAYS) {
        push("note", "stale-price", item, `${name}: priced more than ${STALE_PRICE_DAYS} days ago; reprice before relying on it.`);
      }
    }
    const mark = accuracyMark(item);
    if (mark.tier === "receipt" && !item.changes.some((entry) => entry.source === "receipt photo")) {
      push("blocker", "receipt-mark-without-receipt", item, `${name}: marked receipt verified with no receipt on the line.`);
    }
    if (item.damage && item.priceUsd != null && item.priceUsd > 0 && item.cashValueUsd != null && item.cashValueUsd >= item.priceUsd) {
      push("blocker", "damage-not-in-cash-value", item, `${name}: damage is on the line but cash value was not reduced.`);
    }
    if (item.condition === "damaged" && !item.damage) {
      push("review", "damaged-without-note", item, `${name}: marked damaged with no description of the damage.`);
    }
    if (item.valueBasis && /^exact:/i.test(item.valueBasis) && !(item.identitySettled && (item.brand || item.markings))) {
      push("review", "exact-without-identity", item, `${name}: priced as the exact product, but its brand and model are not confirmed.`);
    }
    if (item.likelyBrand && item.identitySettled && !item.brand) {
      push("review", "likely-brand-settled", item, `${name}: identity is marked settled on a likely brand that was never read or stated.`);
    }
    if (item.enteredBy === "scan" && item.category && !KNOWN_CATEGORIES.has(item.category)) {
      push("note", "unknown-category", item, `${name}: category "${item.category}" is not on the category list.`);
    }
  }

  const bySerial = new Map<string, RoomItem[]>();
  for (const item of items) {
    if (!item.serial) continue;
    const key = norm(item.serial);
    bySerial.set(key, [...(bySerial.get(key) ?? []), item]);
  }
  for (const group of bySerial.values()) {
    if (group.length >= 2) {
      push("blocker", "duplicate-serial", group[0], `${group[0].name}: the same serial appears on ${group.length} lines.`);
    }
  }

  const byIdentity = new Map<string, RoomItem[]>();
  for (const item of items) {
    const key = [norm(item.name), norm(item.brand), norm(item.markings)].join("|");
    if (!norm(item.brand) && !norm(item.markings)) continue;
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), item]);
  }
  for (const group of byIdentity.values()) {
    if (group.length >= 2) {
      push("review", "probable-duplicate", group[0], `${group[0].name}: ${group.length} lines look like the same item; check they are not one object counted twice.`);
    }
  }

  const order: Record<InvariantSeverity, number> = { blocker: 0, review: 1, note: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function checkInventory(inventory: HomeInventory, now = new Date()): InvariantIssue[] {
  return checkLines(
    inventory.rooms.flatMap((room) => room.items),
    now,
  );
}

export function issueCounts(issues: InvariantIssue[]) {
  return {
    blockers: issues.filter((issue) => issue.severity === "blocker").length,
    review: issues.filter((issue) => issue.severity === "review").length,
    notes: issues.filter((issue) => issue.severity === "note").length,
  };
}
