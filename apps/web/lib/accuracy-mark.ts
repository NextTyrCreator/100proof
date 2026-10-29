import { labelWorthAsking } from "./evidence-requests";
import type { RoomItem } from "./inventory";

/**
 * The accuracy mark for one line. It is not a measured accuracy percentage and it is never shown as one.
 * It counts the evidence signals a reviewer can check, so the goal without a receipt is to earn every
 * signal the camera, the narration, and a label can give. A receipt is different from the rest: it ties
 * this item to this person, so it is the only mark called verified. A price someone types or says is
 * theirs, and it is shown as theirs; it does not verify the line.
 */

type AccuracyTier = "receipt" | "strong" | "settled" | "open" | "entered";

type AccuracySignal = { key: string; label: string; met: boolean };

type AccuracyMark = {
  tier: AccuracyTier;
  label: string;
  signals: AccuracySignal[];
  met: number;
  total: number;
  /** The cheapest evidence that would raise this mark. Null when nothing is missing. */
  next: string | null;
  receiptConfirmed: boolean;
};

function hasSource(item: RoomItem, sources: string[]) {
  return item.changes.some((entry) => sources.includes(entry.source));
}

/** A receipt picture or a matched receipt file changed this line. */
export function receiptVerified(item: RoomItem) {
  return item.changes.some((entry) => entry.source === "receipt photo" && entry.after.userValueUsd != null);
}

export function accuracyMark(item: RoomItem): AccuracyMark {
  const clipsSeen = new Set(item.sightings.filter((sighting) => sighting.clipId).map((sighting) => sighting.clipId));
  const receiptConfirmed = receiptVerified(item);
  const exact = item.valueBasis?.startsWith("Exact:") ?? false;

  const signals: AccuracySignal[] = [
    { key: "camera", label: "Seen on camera", met: clipsSeen.size > 0 },
    { key: "secondLook", label: "Seen more than once", met: item.sightings.length >= 2 || clipsSeen.size >= 2 },
    { key: "count", label: "Count settled", met: item.countSettled },
    { key: "identity", label: "Brand and model settled", met: item.identitySettled && Boolean(item.brand || item.markings) },
    { key: "spoken", label: "You described it", met: item.said.length > 0 },
    { key: "label", label: "Label or photo checked", met: hasSource(item, ["label photo", "photo", "clip"]) || Boolean(item.photoPath) },
    { key: "serial", label: "Serial recorded", met: Boolean(item.serial) },
    { key: "paid", label: "Price paid from you", met: item.userValueUsd != null },
    { key: "exactPrice", label: "Priced as the exact product", met: exact },
    { key: "priced", label: "Priced at all", met: item.priceUsd != null },
  ];
  const met = signals.filter((signal) => signal.met).length;

  const corroborations = signals.filter((signal) =>
    ["secondLook", "spoken", "label", "serial", "paid", "exactPrice"].includes(signal.key) && signal.met,
  ).length;

  let tier: AccuracyTier;
  let label: string;
  if (item.enteredBy === "you") {
    tier = "entered";
    label = "Entered by you — not from the scan";
  } else if (receiptConfirmed) {
    tier = "receipt";
    label = "Receipt verified — this item, this owner";
  } else if (item.countSettled && item.identitySettled && item.priceUsd != null && corroborations >= 2) {
    tier = "strong";
    label = "Strong — no receipt";
  } else if (item.countSettled && item.identitySettled && item.priceUsd != null) {
    tier = "settled";
    label = "Settled on camera";
  } else if (item.countSettled && item.priceUsd != null && item.sightings.length > 0) {
    tier = "settled";
    label = "Estimated from video";
  } else {
    tier = "open";
    label = "Needs evidence";
  }

  const next = !item.countSettled
    ? "A wider clip that shows every one"
    : !item.identitySettled && labelWorthAsking(item)
      ? "A close photo of the label"
      : item.priceUsd == null
        ? "A price for this line"
        : !receiptConfirmed
          ? "A receipt, from a photo or Connections"
          : null;

  return { tier, label, signals, met, total: signals.length, next, receiptConfirmed };
}

/** Counts across an inventory. noReceiptStrong is the headline: settled hard, without asking for a receipt. */
export function accuracySummary(items: RoomItem[]) {
  const marks = items.map(accuracyMark);
  const count = (tier: AccuracyTier) => marks.filter((mark) => mark.tier === tier).length;
  const withoutReceipt = marks.filter((mark) => !mark.receiptConfirmed && mark.tier !== "entered");
  const strongWithoutReceipt = withoutReceipt.filter((mark) => mark.tier === "strong" || mark.tier === "settled").length;
  return {
    receipt: count("receipt"),
    strong: count("strong"),
    settled: count("settled"),
    open: count("open"),
    entered: count("entered"),
    strongWithoutReceiptShare:
      withoutReceipt.length === 0 ? null : Math.round((strongWithoutReceipt / withoutReceipt.length) * 100) / 100,
    averageSignals: marks.length === 0 ? null : Math.round((marks.reduce((sum, mark) => sum + mark.met, 0) / marks.length) * 10) / 10,
  };
}
