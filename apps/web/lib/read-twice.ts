import type { IdentityCheck, IdentityRead } from "./identity-check";
import type { RoomItem, RoomShard } from "./inventory";
import { kindOf } from "./repeat-match";
import { modelRecognized, normLabel } from "./review-shape";

/**
 * Read twice. A line that could be worth more than $250 is identified twice by Muse Spark 1.3, from two
 * different stills, and neither read sees the other. Matching answers confirm the line. Answers that
 * disagree mark it unsure and keep both, instead of picking one. Agreement is what backs a specific
 * version over $250, and two reads that name the same model confirm it (see line-confidence). It is a
 * check, not verification: only a receipt or an attached appraisal reaches 99%.
 */
const READ_TWICE_OVER_USD = 250;

function mark(value: string | null | undefined) {
  const text = normLabel(value ?? "").replace(/\s+/g, "");
  return text && !["none", "unknown", "na", "null", "unbranded", "generic"].includes(text) ? text : "";
}

/** Two reads, compared on kind, brand, and model. A model only one read saw stays open; it is not a conflict. */
export function compareReads(a: IdentityRead | null, b: IdentityRead | null): IdentityCheck["result"] {
  if (!a || !b) return "single";
  if (kindOf({ name: a.kind, itemType: a.kind }) !== kindOf({ name: b.kind, itemType: b.kind })) return "unsure";
  if (mark(a.brand) !== mark(b.brand)) return "unsure";
  const modelA = mark(a.model);
  const modelB = mark(b.model);
  if (modelA && modelB && modelA !== modelB && !modelA.includes(modelB) && !modelB.includes(modelA)) return "unsure";
  return "confirmed";
}

/** Lines worth reading twice: from the scan, one object, and possibly over $250. */
export function needsReadTwice(item: RoomItem) {
  if (item.enteredBy !== "scan" || item.grouped || item.hidden || item.identityCheck) return false;
  return (item.priceUsd ?? 0) >= READ_TWICE_OVER_USD;
}

/**
 * Put a check on its line. Unsure leaves identity unsettled. Confirmed fills a brand or model both reads
 * gave only where the line is still empty, and logs it. It settles the line only when both reads named
 * the same model and the line has a brand; agreement on the brand alone never settles a model.
 */
export function withIdentityCheck(item: RoomItem, check: IdentityCheck): RoomItem {
  const next: RoomItem = { ...item, identityCheck: check };
  if (check.result === "unsure") return { ...next, identitySettled: false };
  if (check.result !== "confirmed") return next;
  const [a, b] = check.reads;
  if (!a || !b) return next;
  const bothModels = Boolean(mark(a.model) && mark(b.model));
  const before: Record<string, string | boolean | null> = {};
  const after: Record<string, string | boolean | null> = {};
  if (!item.brand && a.brand && mark(a.brand) === mark(b.brand)) {
    next.brand = a.brand.slice(0, 80);
    next.likelyBrand = null;
    before.brand = null;
    after.brand = next.brand;
  }
  if (!item.markings && a.model && mark(a.model) === mark(b.model)) {
    next.markings = a.model.slice(0, 160);
    before.markings = null;
    after.markings = next.markings;
  }
  if (bothModels && !next.identitySettled && modelRecognized(next.brand, next.markings)) {
    next.identitySettled = true;
    before.identitySettled = false;
    after.identitySettled = true;
  }
  if (Object.keys(after).length === 0) return next;
  next.pricedAt = null;
  next.changes = [...item.changes, { id: crypto.randomUUID(), at: check.at, source: "check" as const, evidenceRef: null, before, after }].slice(-40);
  return next;
}

/** The owner picked one read, or neither. The pick is their answer, logged as their edit. */
export function resolveIdentity(item: RoomItem, pick: "a" | "b" | "neither"): RoomItem {
  const check = item.identityCheck;
  if (!check) return item;
  const chosen = pick === "a" ? check.reads[0] : pick === "b" ? check.reads[1] : null;
  const next: RoomItem = { ...item, identityCheck: { ...check, resolved: pick } };
  if (!chosen) return next;
  const brand = chosen.brand ? chosen.brand.slice(0, 80) : item.brand;
  const markings = chosen.model ? chosen.model.slice(0, 160) : item.markings;
  next.brand = brand;
  next.markings = markings;
  next.likelyBrand = brand ? null : item.likelyBrand;
  next.identitySettled = modelRecognized(brand, markings);
  next.pricedAt = null;
  next.changes = [
    ...item.changes,
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      source: "your edit" as const,
      evidenceRef: null,
      before: { brand: item.brand, markings: item.markings },
      after: { brand, markings },
    },
  ].slice(-40);
  return next;
}

/** Still unsure: the reads disagree and the owner has not picked. */
export function readsDisagree(item: RoomItem) {
  return item.identityCheck?.result === "unsure" && item.identityCheck.resolved == null;
}

/** For the top of the list: how many high-value lines were read twice, and how they came out. */
export function readTwiceSummary(rooms: RoomShard[]) {
  const checked = rooms.flatMap((room) => room.items).filter((item) => !item.hidden && item.identityCheck && item.identityCheck.result !== "single");
  return {
    read: checked.length,
    agreed: checked.filter((item) => item.identityCheck?.result === "confirmed").length,
    unsure: checked.filter(readsDisagree).length,
  };
}

/** Words for the line. "Read twice" is an honest check, never verification. */
export function readOneLine(read: IdentityRead | null) {
  if (!read) return "No answer";
  return [read.brand, read.model, read.kind].filter(Boolean).join(" ");
}
