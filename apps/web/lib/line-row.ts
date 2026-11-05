import type { RoomItem } from "./inventory";
import { lineConfidence } from "./line-confidence";

const NAME_MAX = 20;

/** The list shows at most 20 characters of a name, ellipsis included. The full name opens with the line. */
export function shortName(name: string) {
  const text = name.replace(/\s+/g, " ").trim();
  return text.length > NAME_MAX ? `${text.slice(0, NAME_MAX - 1).trimEnd()}…` : text;
}

/** One short badge per row: the percentage, or the state that has no percentage. */
export function chipText(confidence: ReturnType<typeof lineConfidence>) {
  if (confidence.tier === "receipt") return "Receipt";
  if (confidence.tier === "appraised") return "Appraised";
  if (confidence.tier === "stated") return "Stated";
  if (confidence.percent == null) return "No price";
  return `${confidence.percent}%`;
}

/** What a row adds under the name: the brand and model, a likely brand, or the kind. Never the name again. */
export function rowSubtitle(item: Pick<RoomItem, "name" | "brand" | "markings" | "likelyBrand" | "itemType" | "category">) {
  const identity = [item.brand, item.markings].filter(Boolean).join(" ");
  const likely = item.likelyBrand ? `Likely ${item.likelyBrand.name}` : "";
  const text = identity || likely || item.itemType || item.category || "";
  return text && text.toLowerCase() !== item.name.trim().toLowerCase() ? text : "";
}
