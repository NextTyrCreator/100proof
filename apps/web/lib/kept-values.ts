import type { HomeInventory } from "./inventory";
import { keptLineSchema, keptLinesSchema, priceKey, type KeptLine } from "./review-shape";

const STORAGE_KEY = "100proof.kept-values";

export function keptFromInventories(inventories: HomeInventory[]): KeptLine[] {
  const lines: KeptLine[] = [];
  for (const inventory of inventories) {
    for (const room of inventory.rooms) {
      for (const item of room.items) {
        const amount = item.userValueUsd ?? item.priceUsd;
        if (amount == null || amount < 1) continue;
        lines.push({
          name: item.name,
          description: [item.itemType, item.brand, item.markings].filter(Boolean).join(" ") || item.name,
          color: item.color,
          size: item.size,
          replacementUsd: amount,
        });
      }
    }
  }
  return lines.slice(-40);
}

export function readKeptValues(): KeptLine[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = keptLinesSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function rememberKeptValues(lines: KeptLine[]) {
  if (typeof localStorage === "undefined" || lines.length === 0) return;
  const merged = new Map(readKeptValues().map((line) => [priceKey(line), line]));
  for (const line of lines) {
    const parsed = keptLineSchema.safeParse(line);
    if (parsed.success) merged.set(priceKey(parsed.data), parsed.data);
  }
  const next = [...merged.values()].slice(-40);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
