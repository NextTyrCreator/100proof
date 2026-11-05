import type { RoomItem } from "./inventory";
import { readsDisagree } from "./read-twice";

/**
 * One confidence number per line, from the evidence an appraiser weighs. It is not a measured accuracy
 * rate. The chip, the proof ledger, the assessed total, and the claim file all read this one number.
 *
 * The tier is what the line is known to be. Caps then hold it down for what is still open about it:
 * a price no page backs, a count not settled, or a conflict between two answers.
 */

/** Over this unit replacement, a line needs 85 to count, and a specific version needs the video behind it. */
const HIGH_VALUE_USD = 250;
const COUNTED_UNDER = 75;
const COUNTED_OVER = 85;
/** A comparable outside half to double the stated price is a different item or a wrong price. */
const STATED_LOW = 0.5;
const STATED_HIGH = 2;

type ConfidenceTier =
  | "appraised"
  | "receipt"
  | "modelNumber"
  | "modelName"
  | "brandModel"
  | "classComparable"
  | "brandOnly"
  | "unidentified"
  | "stated"
  | "notPriced";

type Cap = "noPage" | "countOpen" | "versions" | "readsDisagree" | "statedConflict";

const TIERS: Record<ConfidenceTier, { percent: number | null; label: string }> = {
  appraised: { percent: 99, label: "Appraised" },
  receipt: { percent: 99, label: "Receipt verified" },
  modelNumber: { percent: 95, label: "Model number" },
  modelName: { percent: 90, label: "Model confirmed" },
  brandModel: { percent: 85, label: "Brand and model" },
  classComparable: { percent: 75, label: "Class comparable" },
  brandOnly: { percent: 65, label: "Brand only" },
  unidentified: { percent: 40, label: "Needs a close-up" },
  stated: { percent: null, label: "Stated, not seen" },
  notPriced: { percent: null, label: "Not priced" },
};

const CAPS: Record<Cap, { percent: number; label: string }> = {
  versions: { percent: 50, label: "Two versions possible" },
  readsDisagree: { percent: 50, label: "Two reads disagree" },
  statedConflict: { percent: 50, label: "Your price disagrees" },
  noPage: { percent: 60, label: "Price not checked" },
  countOpen: { percent: 70, label: "Count open" },
};

const CONFLICTS: Cap[] = ["versions", "readsDisagree", "statedConflict"];

type LineConfidence = {
  /** Null when the line has no replacement price, or was stated and not seen. */
  percent: number | null;
  /** At or above the bar for its price: 75 under $250, 85 above. Included in the assessed total. */
  assessed: boolean;
  /** Over $250 and not counted, or two answers conflict. A receipt is what would settle it. */
  needsReceipt: boolean;
  /** The reason for the number: the tier, or the cap that holds it down. */
  label: string;
  tier: ConfidenceTier;
  tierLabel: string;
  caps: Cap[];
  /** The percent this line needs to count. */
  bar: number;
};

/** A receipt picture, a receipt filmed during the scan, or a matched receipt file found this item on it. */
export function receiptVerified(item: Pick<RoomItem, "changes">) {
  return item.changes.some((entry) => entry.source === "receipt photo" && entry.after.userValueUsd != null);
}

/** An appraisal amount with its document attached to the line. A typed amount alone is a stated price. */
export function appraisalDocumented(item: Pick<RoomItem, "appraisalUsd" | "appraisalFileId" | "files">) {
  if (item.appraisalUsd == null || item.appraisalUsd <= 0 || !item.appraisalFileId) return false;
  return item.files.some((file) => file.id === item.appraisalFileId);
}

export const APPRAISAL_BASIS = "Appraisal: formal value on file, with the appraisal attached.";

/** The owner's own figure: the price paid, or an appraisal amount with no document. A receipt is not stated. */
export function statedUsd(item: Pick<RoomItem, "changes" | "userValueUsd" | "appraisalUsd" | "appraisalFileId" | "files">) {
  if (receiptVerified(item)) return null;
  if (item.userValueUsd != null && item.userValueUsd > 0) return item.userValueUsd;
  if (!appraisalDocumented(item) && item.appraisalUsd != null && item.appraisalUsd > 0) return item.appraisalUsd;
  return null;
}

/** The comparable is outside half to double the stated price. The comparable is kept and the line asks. */
export function statedConflict(item: RoomItem) {
  const stated = statedUsd(item);
  const price = item.priceUsd;
  if (stated == null || price == null || price <= 0) return false;
  return price < stated * STATED_LOW || price > stated * STATED_HIGH;
}

function statedNotSeen(item: RoomItem) {
  if (item.enteredBy === "you") return true;
  if (/^stated, not seen/i.test(item.detail.trim())) return true;
  return !item.sightings.some((sighting) => sighting.atSec != null || sighting.clipId != null);
}

/** A model the end-of-scan text check guessed. It never saw the video, so it is a lead, not a read. */
function guessedModel(item: RoomItem) {
  return /^likely\b/i.test(item.markings?.trim() ?? "") || /\blikely model\b/i.test(item.detail);
}

const UNIT =
  /^\d+(?:\.\d+)?-?(?:in|inch|inches|ft|feet|cm|mm|m|lb|lbs|kg|g|oz|qt|quarts?|l|ml|gal|gallons?|w|watts?|v|volts?|hz|k|p|gb|tb|mah|pcs?|pieces?|slices?|cups?|seats?|seater|person|tiers?|drawers?|doors?|burners?|speeds?|years?|yrs?)$/i;

/**
 * A model number is a code such as CGS700P2MS, V435-J01, or 5200. A size, a capacity, a count, or a year
 * is not: "65-inch", "12-cup", "4K", "2019". A name such as "iPhone 17 Pro" is a model name, not a number.
 */
export function isModelNumber(markings: string | null) {
  if (!markings || /^likely\b/i.test(markings.trim())) return false;
  return markings.split(/[\s,;()]+/).some((raw) => {
    const token = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
    if (token.length < 4 || !/\d/.test(token)) return false;
    if (UNIT.test(token) || /^\d+x\d+/i.test(token) || /^(19|20)\d{2}$/.test(token)) return false;
    return /[a-z]/i.test(token) || /^\d{4,}$/.test(token);
  });
}

function closeUps(item: RoomItem) {
  return item.changes.filter((entry) => entry.source === "label photo" || entry.source === "photo");
}

/** A label or product close-up read the model, or settled the identity, and it is still settled. */
function modelCloseUp(item: RoomItem) {
  if (!item.identitySettled) return false;
  return closeUps(item).some((entry) => entry.after.markings != null || entry.after.identitySettled === true);
}

/** A close-up read a model on this line. A logo alone shows the maker, not which version it is. */
function modelReadUp(item: RoomItem) {
  return closeUps(item).some((entry) => entry.after.markings != null);
}

/** Both independent reads named a model, and they agree. */
function readsAgreeOnModel(item: RoomItem) {
  const check = item.identityCheck;
  if (check?.result !== "confirmed") return false;
  const [a, b] = check.reads;
  return Boolean(a?.model?.trim() && b?.model?.trim());
}

/** The video backs this version: a model close-up, two reads that agree, or the owner's pick between two reads. */
function versionShown(item: RoomItem) {
  const check = item.identityCheck;
  return modelCloseUp(item) || modelReadUp(item) || check?.result === "confirmed" || check?.resolved === "a" || check?.resolved === "b";
}

function checkedPage(item: RoomItem) {
  if (!item.sourceUrl) return false;
  try {
    const url = new URL(item.sourceUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function tierOf(item: RoomItem): ConfidenceTier {
  if (appraisalDocumented(item)) return "appraised";
  if (item.priceUsd == null) return "notPriced";
  if (receiptVerified(item)) return "receipt";
  if (statedNotSeen(item)) return "stated";
  const over = item.priceUsd > HIGH_VALUE_USD;
  const read = Boolean(item.markings) && !guessedModel(item);
  const guessed = Boolean(item.markings) && guessedModel(item);
  const confirmed = Boolean(item.brand) && read && (modelCloseUp(item) || readsAgreeOnModel(item));
  if (confirmed && isModelNumber(item.markings) && item.valueBasis?.startsWith("Exact:")) return "modelNumber";
  if (confirmed) return "modelName";
  if (item.brand && (read || guessed)) return !over || versionShown(item) ? "brandModel" : "brandOnly";
  if (item.brand) return over ? "brandOnly" : "classComparable";
  return over ? "unidentified" : "classComparable";
}

function capsOf(item: RoomItem, tier: ConfidenceTier): Cap[] {
  if (tier === "appraised" || tier === "receipt" || TIERS[tier].percent == null) return [];
  const caps: Cap[] = [];
  if (item.options.length >= 2) caps.push("versions");
  if (readsDisagree(item)) caps.push("readsDisagree");
  if (statedConflict(item)) caps.push("statedConflict");
  if (!checkedPage(item)) caps.push("noPage");
  if (!item.countSettled) caps.push("countOpen");
  return caps;
}

export function lineConfidence(item: RoomItem): LineConfidence {
  const tier = tierOf(item);
  const caps = capsOf(item, tier);
  let percent = TIERS[tier].percent;
  let label = TIERS[tier].label;
  for (const cap of caps) {
    if (percent != null && CAPS[cap].percent < percent) {
      percent = CAPS[cap].percent;
      label = CAPS[cap].label;
    }
  }
  const over = (item.priceUsd ?? 0) > HIGH_VALUE_USD;
  const bar = over ? COUNTED_OVER : COUNTED_UNDER;
  const assessed = percent != null && item.priceUsd != null && percent >= bar;
  const conflict = caps.some((cap) => CONFLICTS.includes(cap));
  const needsReceipt = !assessed && tier !== "notPriced" && (over || conflict);
  return { percent, assessed, needsReceipt, label, tier, tierLabel: TIERS[tier].label, caps, bar };
}

type ConfidenceTone = "verified" | "exact" | "settled" | "open" | "unsure" | "yours";

/** Teal is only for a receipt or an appraisal. Solid means counted; dashed means not yet. */
export function confidenceTone(confidence: LineConfidence): ConfidenceTone {
  if (confidence.tier === "appraised" || confidence.tier === "receipt") return "verified";
  if (confidence.tier === "stated") return "yours";
  if (confidence.caps.some((cap) => CONFLICTS.includes(cap))) return "unsure";
  if (!confidence.assessed) return "open";
  return confidence.tier === "modelNumber" ? "exact" : "settled";
}

/** What would raise this line, cheapest first. Null when nothing would. */
export function nextEvidence(item: RoomItem, confidence = lineConfidence(item)) {
  if (confidence.tier === "appraised" || confidence.tier === "receipt") return null;
  if (confidence.caps.includes("statedConflict")) return "Say which is right: the price you gave, or the comparable";
  if (confidence.caps.includes("countOpen")) return "A wider clip that shows every one";
  if (confidence.caps.includes("versions") || confidence.caps.includes("readsDisagree")) return "A close photo of the label or model plate";
  if (confidence.tier === "brandOnly" || confidence.tier === "unidentified") return "A close photo of the label or model plate";
  if (confidence.tier === "notPriced") return "A price for this line";
  return "Add the receipt here, or connect the account, to verify this line another way";
}

export function assessedReplacement(items: RoomItem[]) {
  return items.reduce((sum, item) => {
    if (item.hidden || item.priceUsd == null || !lineConfidence(item).assessed) return sum;
    return sum + item.priceUsd * item.count;
  }, 0);
}
