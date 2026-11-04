import { receiptVerified } from "./accuracy-mark";
import type { RoomItem } from "./inventory";

/** A line at or above this is included in the assessed value. It is not a measured accuracy rate. */
const ASSESSED_AT = 75;
/** Over this unit replacement, a line without a supported model waits for a receipt. */
const RECEIPT_OVER_USD = 250;

type LineConfidence = {
  /** Null when the line has no replacement price. */
  percent: number | null;
  /** Included in the assessed total. */
  assessed: boolean;
  /** A receipt is what would confirm the model and the price. */
  needsReceipt: boolean;
  label: string;
};

function likelyModel(item: RoomItem) {
  const text = `${item.markings ?? ""} ${item.detail}`.toLowerCase();
  return text.startsWith("likely model") || text.includes("likely model");
}

function modelNumber(markings: string | null) {
  return Boolean(markings && /\d/.test(markings));
}

/**
 * Rule-based confidence for one line. A receipt is 99. A model number from the walk is 95.
 * A model name from the walk is 90. A brand plus one similar model is 75, and that is enough to assess.
 * Two competing versions, or a high-value line with no model, stay under 75 and wait for a receipt.
 */
export function lineConfidence(item: RoomItem): LineConfidence {
  const price = item.priceUsd;
  if (price == null) {
    return { percent: null, assessed: false, needsReceipt: false, label: "Not priced" };
  }
  const high = price > RECEIPT_OVER_USD;
  if (item.appraisalUsd != null && item.appraisalUsd > 0) {
    return { percent: 99, assessed: true, needsReceipt: false, label: "Appraisal" };
  }
  if (receiptVerified(item)) {
    return { percent: 99, assessed: true, needsReceipt: false, label: "Receipt" };
  }
  if (item.enteredBy === "you") {
    return { percent: null, assessed: false, needsReceipt: high, label: "Entered by you" };
  }
  const competing = item.options.length >= 2;
  const brand = Boolean(item.brand);
  const named = Boolean(item.markings);
  if (competing) {
    return { percent: 60, assessed: false, needsReceipt: true, label: "Version not confirmed" };
  }
  if (brand && named && item.identitySettled && modelNumber(item.markings) && !likelyModel(item)) {
    return { percent: 95, assessed: true, needsReceipt: false, label: "Model number" };
  }
  if (brand && named && item.identitySettled && !likelyModel(item)) {
    return { percent: 90, assessed: true, needsReceipt: false, label: "Model name" };
  }
  if (brand && named) {
    return { percent: 75, assessed: true, needsReceipt: false, label: "Similar model" };
  }
  if (brand && high) {
    return { percent: 60, assessed: false, needsReceipt: true, label: "Brand only" };
  }
  if (brand) {
    return { percent: 70, assessed: false, needsReceipt: false, label: "Brand only" };
  }
  if (high) {
    return { percent: 40, assessed: false, needsReceipt: true, label: "No brand" };
  }
  return { percent: 55, assessed: false, needsReceipt: false, label: "Class estimate" };
}

export function assessedReplacement(items: RoomItem[]) {
  return items.reduce((sum, item) => {
    if (item.hidden || item.priceUsd == null || !lineConfidence(item).assessed) return sum;
    return sum + item.priceUsd * item.count;
  }, 0);
}
