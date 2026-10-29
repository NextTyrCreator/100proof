import { z } from "zod";
import {
  GROUP_UNDER_USD,
  HIGH_VALUE_OVER_USD,
  type RoomItem,
  type RoomShard,
  type SizeBand,
  type Wearer,
} from "./inventory";

const ALWAYS_ROW = new Set([
  "jewelry",
  "watch",
  "firearm",
  "silverware",
  "art",
  "appliance",
  "electronics",
  "furniture",
  "instrument",
  "collectible",
]);

const looseText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value ?? "");

const rawItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: looseText(400),
  count: z
    .number()
    .int()
    .positive()
    .max(999)
    .nullable()
    .optional()
    .transform((value) => value ?? 1),
  category: looseText(40),
  itemType: looseText(80),
  brand: looseText(80),
  markings: looseText(160),
  wearer: looseText(20),
  sizeBand: looseText(20),
  color: z.string().trim().max(40).nullable().optional(),
  size: z.string().trim().max(40).nullable().optional(),
  serial: z.string().trim().max(80).nullable().optional(),
  age: z.string().trim().max(40).nullable().optional(),
  ageYears: z.number().finite().nonnegative().max(100).nullable().optional(),
  condition: looseText(20),
  usefulLifeYears: z.number().finite().positive().max(80).nullable().optional(),
  narration: z.string().trim().max(300).nullable().optional(),
  seenReplacementUsd: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
});

const rawReviewSchema = z.object({
  rooms: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        items: z.array(rawItemSchema).max(80),
      }),
    )
    .max(40),
});

const wearerSchema = z.enum(["women", "men", "kids", "unknown"]).nullable();
const sizeBandSchema = z.enum(["kids", "adults", "unknown"]).nullable();

export const reviewItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  detail: z.string().max(400),
  count: z.number().int().positive().max(999),
  priceUsd: z.number().finite().nonnegative().max(1_000_000).nullable(),
  cashValueUsd: z.number().finite().nonnegative().max(1_000_000).nullable(),
  depreciationNote: z.string().max(300).nullable(),
  serial: z.string().max(80).nullable(),
  age: z.string().max(40).nullable(),
  ageYears: z.number().finite().nonnegative().max(100).nullable(),
  color: z.string().max(40).nullable(),
  size: z.string().max(40).nullable(),
  category: z.string().max(40).nullable(),
  itemType: z.string().max(80).nullable(),
  brand: z.string().max(80).nullable(),
  markings: z.string().max(160).nullable(),
  wearer: wearerSchema,
  sizeBand: sizeBandSchema,
  grouped: z.boolean(),
  enteredBy: z.enum(["scan", "you"]),
  narration: z.string().max(300).nullable(),
  valueBasis: z.string().max(300).nullable(),
  sourceUrl: z.string().max(300).nullable(),
  userNote: z.string().max(500),
  userValueUsd: z.number().finite().nonnegative().max(1_000_000).nullable(),
  photoUrl: z.string().max(2_000).nullable(),
  highValue: z.boolean(),
});

export const reviewResultSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(80),
      items: z.array(reviewItemSchema),
    }),
  ),
});

export const keptLineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(400),
  color: z.string().max(40).nullable(),
  size: z.string().max(40).nullable(),
  replacementUsd: z.number().finite().positive().max(1_000_000),
});

export const keptLinesSchema = z.array(keptLineSchema).max(40);

export type KeptLine = z.infer<typeof keptLineSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export type PricePlace = {
  zip: string | null;
  jurisdiction: string;
};

type Draft = {
  key: string;
  name: string;
  description: string;
  count: number;
  category: string;
  itemType: string;
  brand: string | null;
  markings: string | null;
  wearer: Wearer | null;
  sizeBand: SizeBand | null;
  color: string | null;
  size: string | null;
  serial: string | null;
  age: string | null;
  ageYears: number | null;
  condition: string;
  usefulLifeYears: number | null;
  narration: string | null;
  seenReplacementUsd: number | null;
  roomTitle: string;
};

export type PricedLine = {
  key: string;
  replacementUsd: number | null;
  basis: string;
  sourceUrl: string | null;
};

function clean(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

export function normLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function lineKey(parts: { name: string; description: string; color: string | null; size: string | null; serial?: string | null }) {
  return [parts.name, parts.description, parts.color ?? "", parts.size ?? "", parts.serial ?? ""].map(normLabel).join("|");
}

/** Price memory and web search use this key. It never includes a serial. */
export function priceKey(parts: { name: string; description: string; color: string | null; size: string | null }) {
  return lineKey({ ...parts, serial: null });
}

export function pricePlace(address: string, regionLabel: string): PricePlace {
  const zip =
    address.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ??
    address.match(/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/i)?.[0] ??
    address.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i)?.[0] ??
    null;
  const state = address.match(
    /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia)\b/i,
  )?.[0];
  const jurisdiction = [state, regionLabel].filter(Boolean).join(", ") || regionLabel || "the property's country";
  return { zip, jurisdiction };
}

function httpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().slice(0, 300);
  } catch {
    return null;
  }
}

export function readModelJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The review did not come back as a list.");
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

function asWearer(value: string, category: string): Wearer | null {
  if (category !== "clothing" && category !== "shoes") return null;
  const text = value.toLowerCase();
  if (text.startsWith("wom") || text === "female") return "women";
  if (text === "men" || text === "male" || text.startsWith("man")) return "men";
  if (text.includes("kid") || text.includes("child") || text === "boy" || text === "girl") return "kids";
  return "unknown";
}

function asSizeBand(value: string, category: string): SizeBand | null {
  if (category !== "clothing" && category !== "shoes") return null;
  const text = value.toLowerCase();
  if (text.includes("kid") || text.includes("child") || text === "youth") return "kids";
  if (text.includes("adult")) return "adults";
  return "unknown";
}

export function depreciate(replacement: number, ageYears: number | null, usefulLifeYears: number | null, condition: string | null) {
  if (ageYears == null || usefulLifeYears == null || usefulLifeYears <= 0) {
    return {
      cash: replacement,
      note: "No age was clear, so depreciation was not taken. The cash value matches replacement.",
    };
  }
  let life = usefulLifeYears;
  const wear = (condition ?? "").toLowerCase();
  if (wear === "worn") life *= 0.8;
  if (wear === "new") life *= 1.1;
  const used = Math.min(1, Math.max(0, ageYears / life));
  const remain = Math.max(0.2, 1 - used);
  return {
    cash: Math.round(replacement * remain * 100) / 100,
    note: `Adjuster estimate. About ${ageYears} years into a ${Math.round(life)} year life, so cash value is ${Math.round(remain * 100)}% of replacement. The piece was still in the home, so the estimate stops at 20%. A carrier can use another schedule.`,
  };
}

function shouldGroup(draft: Draft) {
  if (draft.serial) return false;
  if (ALWAYS_ROW.has(draft.category)) return false;
  const unit = draft.seenReplacementUsd;
  if (unit != null && unit >= GROUP_UNDER_USD) return false;
  return true;
}

function knownMark(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return null;
  const norm = text.toLowerCase();
  if (["unknown", "n/a", "na", "none", "unbranded", "generic", "no brand", "not visible"].includes(norm)) return null;
  return text;
}

function groupTitle(draft: Draft) {
  const who =
    draft.wearer === "women" ? "Women's" : draft.wearer === "men" ? "Men's" : draft.wearer === "kids" ? "Kids'" : draft.wearer === "unknown" ? "Unspecified" : "";
  const size =
    draft.wearer === "kids" || draft.sizeBand == null
      ? ""
      : draft.sizeBand === "kids"
        ? "kids"
        : draft.sizeBand === "adults"
          ? "adult"
          : "size not clear";
  return [who, size, draft.brand, draft.itemType || draft.name].filter(Boolean).join(" ").slice(0, 120);
}

function rowName(draft: Draft, grouped: boolean) {
  if (grouped) return groupTitle(draft);
  if (draft.brand && !draft.name.toLowerCase().includes(draft.brand.toLowerCase())) {
    return `${draft.brand} ${draft.name}`.slice(0, 120);
  }
  return draft.name;
}

function blankItem(draft: Draft, priceUsd: number | null, valueBasis: string | null, sourceUrl: string | null, grouped: boolean): RoomItem {
  const unit = priceUsd;
  const worn = unit == null ? { cash: null, note: null } : depreciate(unit, draft.ageYears, draft.usefulLifeYears, draft.condition);
  return {
    id: crypto.randomUUID(),
    name: rowName(draft, grouped),
    detail: (grouped
      ? `Counted together for the carrier. ${draft.count} ${[draft.brand, draft.itemType || draft.category].filter(Boolean).join(" ")} pieces, each under $${GROUP_UNDER_USD} to replace.${draft.markings ? ` Mark: ${draft.markings}.` : ""}`
      : draft.description
    ).slice(0, 400),
    count: draft.count,
    priceUsd: unit,
    cashValueUsd: worn.cash,
    depreciationNote: worn.note,
    serial: grouped ? null : draft.serial,
    age: draft.age,
    ageYears: draft.ageYears,
    color: draft.color,
    size: draft.size,
    category: draft.category,
    itemType: draft.itemType,
    brand: draft.brand,
    markings: draft.markings,
    wearer: draft.wearer,
    sizeBand: draft.sizeBand,
    grouped,
    enteredBy: "scan",
    narration: draft.narration,
    valueBasis,
    sourceUrl,
    userNote: "",
    userValueUsd: null,
    photoUrl: null,
    highValue: unit != null && unit > HIGH_VALUE_OVER_USD,
  };
}

/** Turn a model list into itemized rows and category groups under $100. */
export function shapeWalkthrough(raw: unknown, priced: PricedLine[], kept: KeptLine[]): ReviewResult {
  const parsed = rawReviewSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The review did not come back as a list.");

  const drafts: Draft[] = [];
  for (const room of parsed.data.rooms) {
    for (const item of room.items) {
      const category = normLabel(item.category) || "other";
      const draft: Draft = {
        key: "",
        name: item.name.trim(),
        description: item.description.trim(),
        count: item.count,
        category,
        itemType: item.itemType.trim() || item.name.trim(),
        brand: knownMark(item.brand),
        markings: knownMark(item.markings),
        wearer: asWearer(item.wearer, category),
        sizeBand: asSizeBand(item.sizeBand, category),
        color: clean(item.color),
        size: clean(item.size),
        serial: clean(item.serial),
        age: clean(item.age),
        ageYears: item.ageYears ?? null,
        condition: item.condition.trim(),
        usefulLifeYears: item.usefulLifeYears ?? null,
        narration: clean(item.narration),
        seenReplacementUsd: item.seenReplacementUsd ?? null,
        roomTitle: room.title.trim(),
      };
      if (draft.serial && draft.markings?.includes(draft.serial)) {
        draft.markings = knownMark(draft.markings.replaceAll(draft.serial, " "));
      }
      draft.key = shouldGroup(draft)
        ? ["group", draft.category, draft.itemType, draft.wearer ?? "", draft.sizeBand ?? "", draft.brand ?? "", draft.markings ?? ""].map(normLabel).join("|")
        : [lineKey(draft), normLabel(draft.brand ?? ""), normLabel(draft.markings ?? "")].join("|");
      const existing = drafts.find((line) => line.roomTitle === draft.roomTitle && line.key === draft.key);
      if (!existing) {
        drafts.push(draft);
        continue;
      }
      const nextCount = existing.count + draft.count;
      if (existing.ageYears != null && draft.ageYears != null) {
        existing.ageYears = (existing.ageYears * existing.count + draft.ageYears * draft.count) / nextCount;
      } else {
        existing.ageYears = null;
      }
      existing.count = nextCount;
      if (draft.seenReplacementUsd != null) {
        existing.seenReplacementUsd = Math.max(existing.seenReplacementUsd ?? 0, draft.seenReplacementUsd);
      }
    }
  }

  const prices = new Map(priced.map((line) => [line.key, line]));
  const keptPrices = new Map(kept.map((line) => [priceKey(line), line.replacementUsd]));
  const byRoom = new Map<string, RoomItem[]>();

  for (const draft of drafts) {
    const grouped = shouldGroup(draft);
    const lookup = priceKey({
      name: rowName(draft, grouped),
      description: [draft.itemType, draft.brand, draft.markings].filter(Boolean).join(" "),
      color: draft.color,
      size: draft.size,
    });
    const found = prices.get(lookup) ?? prices.get(priceKey(draft));
    const keptUsd = keptPrices.get(lookup);
    let price = found?.replacementUsd ?? null;
    let basis = found?.basis?.trim().slice(0, 300) || null;
    const sourceUrl = httpUrl(found?.sourceUrl ?? null);
    if (price == null && keptUsd != null) {
      price = keptUsd;
      basis = "Previous amount kept on this account.";
    } else if (price == null && draft.seenReplacementUsd != null) {
      price = draft.seenReplacementUsd;
      basis = "Seen in the walkthrough. Not web-checked.";
    } else if (price != null && !basis) {
      basis = "Local replacement.";
    }
    let groupedNow = grouped;
    if (price != null && price >= GROUP_UNDER_USD) groupedNow = false;
    else if (price != null && price < GROUP_UNDER_USD && !draft.serial && !ALWAYS_ROW.has(draft.category)) groupedNow = true;
    const item = blankItem(draft, price, basis, sourceUrl, groupedNow);
    const bucket = byRoom.get(draft.roomTitle) ?? [];
    bucket.push(item);
    byRoom.set(draft.roomTitle, bucket);
  }

  const rooms: RoomShard[] = [...byRoom.entries()].map(([title, items]) => ({
    id: crypto.randomUUID(),
    title,
    items,
  }));

  return reviewResultSchema.parse({ rooms });
}
