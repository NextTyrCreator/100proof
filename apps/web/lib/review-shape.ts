import { z } from "zod";
import { identityCheckSchema } from "./identity-check";
import { cleanItemName, placeRoom, type RoomMarker } from "./scan-rooms";
import {
  GROUP_UNDER_USD,
  HIGH_VALUE_OVER_USD,
  type Condition,
  type Damage,
  type DamageSeverity,
  type ItemAsk,
  type LikelyBrand,
  type RoomItem,
  type RoomShard,
  type SizeBand,
  type ValueOption,
  type Wearer,
} from "./inventory";

export const CATEGORIES = [
  "clothing",
  "shoes",
  "books",
  "food",
  "linens",
  "dishes",
  "utensils",
  "pantry",
  "toiletries",
  "cleaning",
  "office",
  "media",
  "furniture",
  "appliance",
  "electronics",
  "jewelry",
  "watch",
  "firearm",
  "silverware",
  "art",
  "instrument",
  "collectible",
  "other",
] as const;

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
  damage: looseText(160),
  damageSeverity: looseText(20),
  damageAtSec: z.number().finite().nonnegative().max(600).nullable().optional().catch(null),
  likelyBrand: looseText(80),
  brandClues: looseText(200),
  usefulLifeYears: z.number().finite().positive().max(80).nullable().optional().catch(null),
  narration: z.string().trim().max(300).nullable().optional(),
  pricePaidUsd: z.number().finite().nonnegative().max(1_000_000).nullable().optional().catch(null),
  boughtYear: z.number().int().min(1900).max(2100).nullable().optional().catch(null),
  seenReplacementUsd: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  seenAtSec: z.number().finite().nonnegative().max(600).nullable().optional(),
  saidAtSec: z.number().finite().nonnegative().max(600).nullable().optional(),
  appraise: z.boolean().nullable().optional(),
  countSettled: z.boolean().nullable().optional(),
  identitySettled: z.boolean().nullable().optional(),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        lowUsd: z.number().finite().nonnegative().max(1_000_000),
        highUsd: z.number().finite().nonnegative().max(1_000_000),
      }),
    )
    .max(6)
    .nullable()
    .optional()
    .catch([]),
  ask: z
    .object({
      kind: z.enum(["label", "wider", "receipt", "question"]),
      prompt: z.string().trim().max(400).nullable().optional(),
    })
    .nullable()
    .optional()
    .catch(null),
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
const evidenceKindSchema = z.enum(["label", "wider", "receipt", "question"]);
const changeValueSchema = z.union([z.string().max(400), z.number().finite(), z.boolean(), z.null()]);

const sightingSchema = z.object({
  clipId: z.string().uuid().nullable(),
  atSec: z.number().finite().nonnegative().max(600).nullable(),
});

const saidFactSchema = z.object({
  text: z.string().trim().min(1).max(300),
  clipId: z.string().uuid().nullable(),
  atSec: z.number().finite().nonnegative().max(600).nullable(),
  heard: z.enum(["transcript", "video", "typed"]),
});

export const valueOptionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  lowUsd: z.number().finite().nonnegative().max(1_000_000),
  highUsd: z.number().finite().nonnegative().max(1_000_000),
});

export const conditionSchema = z.enum(["new", "good", "fair", "worn", "damaged"]);

export const damageSchema = z.object({
  note: z.string().trim().min(1).max(160),
  severity: z.enum(["minor", "moderate", "severe"]),
  clipId: z.string().uuid().nullable(),
  atSec: z.number().finite().nonnegative().max(600).nullable(),
});

const likelyBrandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  clues: z.string().trim().min(1).max(200),
});

const itemChangeSchema = z.object({
  id: z.string().uuid(),
  at: z.string().min(1).max(40),
  source: z.enum(["label photo", "receipt photo", "photo", "clip", "your answer", "your edit", "check"]),
  evidenceRef: z.string().max(300).nullable(),
  before: z.record(z.string().max(40), changeValueSchema),
  after: z.record(z.string().max(40), changeValueSchema),
});

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
  /** The life the cash value was computed on. A category fix replaces it with that kind's life. */
  usefulLifeYears: z.number().finite().positive().max(80).nullable().default(null),
  color: z.string().max(40).nullable(),
  size: z.string().max(40).nullable(),
  category: z.string().max(40).nullable(),
  itemType: z.string().max(80).nullable(),
  brand: z.string().max(80).nullable(),
  markings: z.string().max(160).nullable(),
  likelyBrand: likelyBrandSchema.nullable().default(null),
  condition: conditionSchema.nullable().default(null),
  damage: damageSchema.nullable().default(null),
  wearer: wearerSchema,
  sizeBand: sizeBandSchema,
  grouped: z.boolean(),
  enteredBy: z.enum(["scan", "you"]),
  narration: z.string().max(300).nullable(),
  valueBasis: z.string().max(300).nullable(),
  sourceUrl: z.string().max(300).nullable(),
  userNote: z.string().max(500),
  userValueUsd: z.number().finite().nonnegative().max(1_000_000).nullable(),
  appraisalUsd: z.number().finite().nonnegative().max(1_000_000).nullable().default(null),
  appraisalFileId: z.string().uuid().nullable().catch(null).default(null),
  selfDeclaredUsd: z.number().finite().nonnegative().max(1_000_000).nullable().default(null),
  photoUrl: z.string().max(2_000).nullable(),
  photoPath: z.string().max(300).nullable(),
  files: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        path: z.string().min(1).max(300),
        mediaType: z.string().max(80),
        url: z.string().max(2_000).nullable().default(null),
      }),
    )
    .max(8)
    .default([]),
  declared: z.boolean().default(false),
  hidden: z.boolean().default(false),
  highValue: z.boolean(),
  sightings: z.array(sightingSchema).max(60),
  said: z.array(saidFactSchema).max(20),
  countSettled: z.boolean(),
  identitySettled: z.boolean(),
  options: z.array(valueOptionSchema).max(3),
  ask: z.object({ kind: evidenceKindSchema, prompt: z.string().max(160) }).nullable(),
  skipped: z.array(evidenceKindSchema).max(4),
  pricedAt: z.string().max(40).nullable(),
  changes: z.array(itemChangeSchema).max(40),
  /** Read twice, for lines that could be over $250. Older lines have none. */
  identityCheck: identityCheckSchema.nullable().optional(),
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
  condition: Condition | null;
  damage: Damage | null;
  likelyBrand: LikelyBrand | null;
  usefulLifeYears: number | null;
  narration: string | null;
  pricePaidUsd: number | null;
  seenReplacementUsd: number | null;
  roomTitle: string;
  seenAt: number[];
  saidAtSec: number | null;
  countSettled: boolean;
  identitySettled: boolean;
  options: ValueOption[];
  ask: ItemAsk | null;
};

type Heard = "transcript" | "video";

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

/** A copied placeholder, not a fact. "No damage" is the absence of a note. */
export function isBlankFact(value: string | null | undefined) {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return true;
  return /^(none|n\/a|na|no|nil|unknown|no damage|undamaged|not damaged|no visible damage|none visible|no issues|unbranded|generic|no brand|not visible)$/.test(text);
}

export function normLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function lineKey(parts: { name: string; description: string; color: string | null; size: string | null; serial?: string | null }) {
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

export function httpUrl(value: string | null) {
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

/**
 * A listing cut off at the output limit. Keep it up to the last item that closed, and close the arrays.
 * Returns null when no complete item is there.
 */
export function salvageRoomsJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const body = text.slice(start);
  let tries = 0;
  for (let end = body.lastIndexOf("}"); end > 0 && tries < 80; end = body.lastIndexOf("}", end - 1), tries += 1) {
    for (const tail of ["]}]}", "}]}", "]}", ""]) {
      try {
        const value = JSON.parse(body.slice(0, end + 1) + tail) as { rooms?: { items?: unknown[] }[] };
        if (Array.isArray(value.rooms) && value.rooms.some((room) => Array.isArray(room.items) && room.items.length > 0)) return value;
      } catch {
        // Try a shorter cut.
      }
    }
  }
  return null;
}

/** Years of age from what the listing or the person said. A year in the future, or before 1950, is ignored. */
export function ageFromSpeech(
  parts: { ageYears?: number | null; boughtYear?: number | null; age?: string | null; narration?: string | null },
  now = new Date(),
): number | null {
  // A copied template sends 0. A real age, or a year they said, has to win over that 0.
  if (parts.ageYears != null && parts.ageYears > 0) return parts.ageYears;
  const thisYear = now.getUTCFullYear();
  const fromYear = (year: number) => (year >= 1950 && year <= thisYear ? thisYear - year : null);
  if (parts.boughtYear != null) {
    const years = fromYear(parts.boughtYear);
    if (years != null) return years;
  }
  for (const text of [parts.age, parts.narration]) {
    if (!text) continue;
    const bare = text.trim().match(/^(\d{1,2}(?:\.\d)?)$/);
    if (bare && text === parts.age) return Number(bare[1]);
    const old = text.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:years?|yrs?)(?:\s+old)?\b/i);
    if (old) return Number(old[1]);
    const year = text.match(/(?<![$\d.,])\b(19[5-9]\d|20\d\d)\b(?![\d,])/);
    if (year) {
      const years = fromYear(Number(year[1]));
      if (years != null) return years;
    }
  }
  if (parts.ageYears === 0) return 0;
  return null;
}

/** Used when the listing gave an age but no useful life. A carrier can use another schedule. */
const USEFUL_LIFE: Record<string, number> = {
  furniture: 10,
  appliance: 10,
  electronics: 5,
  clothing: 3,
  shoes: 2,
  linens: 5,
  dishes: 10,
  utensils: 10,
  office: 7,
  media: 10,
  instrument: 15,
  other: 8,
};

/** Null for kinds that do not wear out on a schedule: jewelry, art, collectibles, silverware, watches, firearms. */
export function lifeFor(category: string | null) {
  return USEFUL_LIFE[normLabel(category ?? "") || "other"] ?? null;
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

export function asCondition(value: string | null | undefined): Condition | null {
  const text = (value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!text) return null;
  if (/\b(unopened|sealed|original box|original packaging)\b/.test(text)) return "new";
  if ((/\b(no|not|without|zero)\b/.test(text) && text.includes("damage")) || text === "undamaged" || text === "intact") return "good";
  if (text.includes("damage") || text.includes("broken")) return "damaged";
  if (text === "poor" || text.includes("heavy")) return "worn";
  if (/\bnew\b/.test(text) && !/\b(not|no|used)\b/.test(text)) return "new";
  if (text === "good" || text === "excellent" || text === "very good") return "good";
  if (text === "fair" || text.startsWith("fair ")) return "fair";
  if (text === "worn" || text === "used") return "worn";
  return null;
}

export function asSeverity(value: string | null | undefined): DamageSeverity {
  const text = (value ?? "").trim().toLowerCase();
  if (text.startsWith("sev") || text.includes("broken") || text.includes("unusable")) return "severe";
  if (text.startsWith("mod")) return "moderate";
  return "minor";
}

const SEVERITY_RANK: Record<DamageSeverity, number> = { minor: 1, moderate: 2, severe: 3 };

/** The worse of two damage notes. Damage seen once stays on the line. */
export function worseDamage(a: Damage | null, b: Damage | null) {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a;
}

const CONDITION_RANK: Record<Condition, number> = { new: 0, good: 1, fair: 2, worn: 3, damaged: 4 };

export function worseCondition(a: Condition | null, b: Condition | null) {
  if (!a) return b;
  if (!b) return a;
  return CONDITION_RANK[b] > CONDITION_RANK[a] ? b : a;
}

/** Share of the depreciated value left after damage. A carrier can use another schedule. */
const DAMAGE_LEFT: Record<DamageSeverity, number> = { minor: 0.9, moderate: 0.7, severe: 0.4 };

/**
 * Cash value is replacement less physical depreciation: age against useful life, adjusted for condition,
 * then any damage the camera showed. Replacement itself is never reduced, because it is the price of a new one.
 * With no age, cash value stays unknown instead of matching replacement. A kind that does not wear out on a
 * schedule (jewelry, art, collectibles) keeps replacement, less any damage.
 */
export function depreciate(
  replacement: number,
  ageYears: number | null,
  usefulLifeYears: number | null,
  condition: string | null,
  damage: Pick<Damage, "severity"> | null = null,
): { cash: number | null; note: string } {
  const left = damage ? DAMAGE_LEFT[damage.severity] : 1;
  const damageText = damage ? ` ${damage.severity[0]?.toUpperCase()}${damage.severity.slice(1)} damage on camera takes off ${Math.round((1 - left) * 100)}%.` : "";
  if (usefulLifeYears == null || usefulLifeYears <= 0) {
    return {
      cash: Math.round(replacement * left * 100) / 100,
      note: `This kind does not wear out on a schedule, so no age is deducted.${damageText} A carrier can use another schedule.`.slice(0, 300),
    };
  }
  if (ageYears == null) {
    return {
      cash: null,
      note: `Age not known, so the cash value is not set. Add the year bought or a photo of the label to set it.${damage ? ` The ${damage.severity} damage seen on camera will be deducted then.` : ""}`.slice(0, 300),
    };
  }
  let life = usefulLifeYears;
  const wear = (condition ?? "").toLowerCase();
  if (wear === "worn") life *= 0.8;
  if (wear === "fair") life *= 0.9;
  if (wear === "new") life *= 1.1;
  const used = Math.min(1, Math.max(0, ageYears / life));
  const remain = Math.max(0.2, 1 - used);
  const share = remain * left;
  const floor = remain === 0.2 ? " Wear stops at 20% because the piece was still in use." : "";
  return {
    cash: Math.round(replacement * share * 100) / 100,
    note: `Adjuster estimate. About ${ageYears} years into a ${Math.round(life)} year life leaves ${Math.round(remain * 100)}%.${damageText} Cash value is ${Math.round(share * 100)}% of replacement.${floor} A carrier can use another schedule.`.slice(0, 300),
  };
}

/** Cash value again after the condition or damage on a line changed. */
export function revalue(item: Pick<RoomItem, "priceUsd" | "ageYears" | "category" | "condition" | "damage" | "usefulLifeYears">) {
  if (item.priceUsd == null) return null;
  return depreciate(item.priceUsd, item.ageYears, item.usefulLifeYears ?? lifeFor(item.category), item.condition, item.damage);
}

function shouldGroup(draft: Draft) {
  if (draft.serial) return false;
  if (isDecor(draft)) return false;
  if (isBulkKind(draft)) return true;
  if (ALWAYS_ROW.has(draft.category)) return false;
  const unit = draft.seenReplacementUsd;
  if (unit != null && unit >= GROUP_UNDER_USD) return false;
  return true;
}

/** Decor is one line per piece. The room shows those lines together. */
export function isDecor(parts: { name: string; itemType?: string | null; detail?: string; description?: string; category?: string | null }) {
  return /\bdecor/i.test(`${parts.name} ${parts.itemType ?? ""} ${parts.detail ?? ""} ${parts.description ?? ""} ${parts.category ?? ""}`);
}

/**
 * Dishes, glassware, flatware, cookware, and linens are counted as one bulk line, never one row per plate.
 * Sterling silverware is not bulk: it stays on its own row by value.
 */
function isBulkKind(parts: { name: string; itemType?: string | null; category?: string | null }) {
  const text = `${parts.name} ${parts.itemType ?? ""}`.toLowerCase();
  if (/\b(sterling|silver)\b/.test(text)) return false;
  // Weight plates, a barbell, a decorative dish, a cutting board, or a bed's comforter are not a kitchen set.
  if (/\b(weights?|bumper|olympic|barbells?|dumbbells?|kettlebells?|gym|fitness|exercise)\b/.test(text)) return false;
  if (/\b(decorative|trinket|candy|accent|ornamental|serving|platter|cutting|chopping|comforter|duvet|quilt|blanket|throw|pillows?)\b/.test(text) && !/\bpillowcases?\b/.test(text)) return false;
  const category = normLabel(parts.category ?? "");
  if (category === "dishes" || category === "utensils" || category === "linens") return true;
  return /\b(plates?|bowls?|dinnerware|dishes|dish set|glassware|wine glasses|drinking glasses|tumblers?|mugs?|cups?|flatware|cutlery|utensils?|cookware|pots and pans|bakeware|towels?|washcloths?|sheets?|pillowcases?)\b/.test(text);
}

function knownMark(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return null;
  const norm = text.toLowerCase();
  if (["unknown", "n/a", "na", "none", "unbranded", "generic", "no brand", "not visible"].includes(norm)) return null;
  return text;
}

/** A model name with its maker, or a model number, is enough to appraise. A brand alone is not. */
export function modelRecognized(brand: string | null, markings: string | null) {
  if (!markings) return false;
  if (/^likely\b/i.test(markings)) return false;
  if (brand) return true;
  return /\d/.test(markings);
}

/** A drink, a pencil, a notepad, trash, or an empty shipping box is not appraised. A storage box is. */
export function isNotProperty(name: string, kind: string, detail: string) {
  const text = `${name} ${kind} ${detail}`.toLowerCase();
  if (/\b(storage|moving|plastic|file|bin|tote|crate)\b/.test(text) && /\b(box|bin|tote|crate)\b/.test(text)) return false;
  // The can or bin is property. What is in it is not.
  if (/\b(trash|garbage|rubbish|recycling|waste)\s+(cans?|bins?|baskets?|receptacles?)\b|\bwastebaskets?\b/.test(text)) return false;
  if (/\b(trash|garbage|rubbish|scrap paper|notepad|sticky notes?|loose papers?)\b/.test(text)) return true;
  if (/\b(pencil|pen|marker)\b/.test(text) && !/\b(sharpener|case|set|holder|cup)\b/.test(text)) return true;
  if (/\b(drink|coffee|tea|soda|water)\b/.test(text) && /\b(mug|cup|glass)\b/.test(text) && !/\b(set|maker|machine|table|press)\b/.test(text)) return true;
  if (/\b(empty|shipping|cardboard)\b/.test(text) && /\bbox(es)?\b/.test(text)) return true;
  if (/\b(food|snack|leftovers?|perishables?)\b/.test(text) && !/\b(processor|saver|storage|container)\b/.test(text)) return true;
  return false;
}

function groupTitle(draft: Draft) {
  // Only what is known goes in the name. "Unspecified size not clear clogs" is just "Clogs".
  const who = draft.wearer === "women" ? "Women's" : draft.wearer === "men" ? "Men's" : draft.wearer === "kids" ? "Kids'" : "";
  const size = draft.wearer === "kids" ? "" : draft.sizeBand === "kids" ? "kids" : draft.sizeBand === "adults" ? "adult" : "";
  const title = [who, size, draft.brand, draft.itemType || draft.name].filter(Boolean).join(" ").slice(0, 120);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function rowName(draft: Draft, grouped: boolean) {
  if (grouped && isBulkKind(draft) && draft.count > 1 && !draft.brand) return `Various ${draft.itemType || draft.name}`.slice(0, 120);
  if (grouped) return groupTitle(draft);
  if (draft.brand && !draft.name.toLowerCase().includes(draft.brand.toLowerCase())) {
    return `${draft.brand} ${draft.name}`.slice(0, 120);
  }
  return draft.name;
}

function blankItem(
  draft: Draft,
  priceUsd: number | null,
  valueBasis: string | null,
  sourceUrl: string | null,
  grouped: boolean,
  heard: Heard,
  pricedAt: string | null,
): RoomItem {
  const unit = priceUsd;
  // A grouped line has no single damage note, so it is not priced as one damaged piece.
  const lineDamage = grouped ? null : draft.damage;
  const lineCondition = grouped && !lineDamage && draft.condition === "damaged" ? "worn" : draft.condition;
  const worn = unit == null ? { cash: null, note: null } : depreciate(unit, draft.ageYears, draft.usefulLifeYears, lineCondition, lineDamage);
  return {
    id: crypto.randomUUID(),
    name: rowName(draft, grouped),
    detail: (grouped
      ? isBulkKind(draft)
        ? `About ${draft.count} ${[draft.brand, draft.itemType || draft.name].filter(Boolean).join(" ")}, counted as one set. The count is an estimate from the walk; priced per piece.${draft.description ? ` ${draft.description}` : ""}`
        : `${draft.count} ${[draft.brand, draft.itemType || draft.name].filter(Boolean).join(" ")} counted together, each under $${GROUP_UNDER_USD} to replace.${draft.description ? ` ${draft.description}` : ""}${draft.markings ? ` Mark: ${draft.markings}.` : ""}`
      : draft.description
    ).slice(0, 400),
    count: draft.count,
    priceUsd: unit,
    cashValueUsd: worn.cash,
    depreciationNote: worn.note,
    serial: grouped ? null : draft.serial,
    age: draft.age,
    ageYears: draft.ageYears,
    usefulLifeYears: draft.usefulLifeYears,
    color: draft.color,
    size: draft.size,
    category: draft.category,
    itemType: draft.itemType,
    brand: draft.brand,
    markings: draft.markings,
    likelyBrand: draft.brand ? null : draft.likelyBrand,
    condition: lineCondition,
    damage: lineDamage,
    wearer: draft.wearer,
    sizeBand: draft.sizeBand,
    grouped,
    enteredBy: "scan",
    narration: draft.narration,
    valueBasis,
    sourceUrl,
    userNote: "",
    userValueUsd: draft.pricePaidUsd,
    appraisalUsd: null,
    appraisalFileId: null,
    selfDeclaredUsd: null,
    photoUrl: null,
    photoPath: null,
    files: [],
    declared: false,
    hidden: false,
    highValue: unit != null && unit > HIGH_VALUE_OVER_USD,
    sightings: draft.seenAt.slice(0, 60).map((atSec) => ({ clipId: null, atSec })),
    said: draft.narration
      ? [{ text: draft.narration.slice(0, 300), clipId: null, atSec: draft.saidAtSec, heard }]
      : [],
    countSettled: draft.countSettled,
    identitySettled: draft.likelyBrand && !draft.brand && !draft.markings ? false : draft.identitySettled,
    options: draft.identitySettled ? [] : draft.options.slice(0, 3),
    ask: draft.ask,
    skipped: [],
    pricedAt,
    changes: [],
  };
}

/** Damage needs a description; a damage note makes the condition damaged. */
function seenCondition(item: { condition: string; damage: string; damageSeverity: string; damageAtSec?: number | null }) {
  const note = clean(item.damage);
  const damage: Damage | null =
    note && !isBlankFact(note) ? { note, severity: asSeverity(item.damageSeverity), clipId: null, atSec: item.damageAtSec ?? null } : null;
  return { condition: damage ? ("damaged" as const) : asCondition(item.condition), damage };
}

/** A likely maker is kept only with the clues behind it, and never when a brand was read or spoken. */
function likelyMaker(brand: string, likely: string, clues: string): LikelyBrand | null {
  if (knownMark(brand)) return null;
  const name = knownMark(likely);
  const why = clean(clues);
  if (!name || !why) return null;
  return { name: name.slice(0, 80), clues: why.slice(0, 200) };
}

function settledAsk(
  ask: { kind: ItemAsk["kind"]; prompt?: string | null } | null | undefined,
  countSettled: boolean,
  identitySettled: boolean,
): ItemAsk | null {
  if (!ask) return !countSettled ? { kind: "wider", prompt: "" } : null;
  if (ask.kind === "label" && identitySettled) return null;
  const prompt = ask.kind === "question" ? (ask.prompt ?? "").trim().slice(0, 160) : "";
  if (ask.kind === "question" && !prompt) return null;
  return { kind: ask.kind, prompt };
}

/** Two lines that share one second are not each showing that frame. Drop the shared time so the thumbnail is not another object. */
export function clearSharedSightings<T extends { roomTitle: string; seenAt: number[] }>(drafts: T[]) {
  const rooms = new Map<string, T[]>();
  for (const draft of drafts) {
    const list = rooms.get(draft.roomTitle) ?? [];
    list.push(draft);
    rooms.set(draft.roomTitle, list);
  }
  for (const group of rooms.values()) {
    const at = new Map<number, T[]>();
    for (const draft of group) {
      if (draft.seenAt.length !== 1) continue;
      const second = draft.seenAt[0] ?? 0;
      const list = at.get(second) ?? [];
      list.push(draft);
      at.set(second, list);
    }
    for (const list of at.values()) {
      if (list.length < 2) continue;
      for (const draft of list) draft.seenAt = [];
    }
  }
}

/** Turn a model list into itemized rows and category groups under $100. */
export function shapeWalkthrough(
  raw: unknown,
  priced: PricedLine[],
  kept: KeptLine[],
  heard: Heard = "video",
  markers: RoomMarker[] = [],
): ReviewResult {
  const pricedAt = new Date().toISOString();
  const parsed = rawReviewSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The review did not come back as a list.");

  const drafts: Draft[] = [];
  /** The room the listing put each draft in, before a tapped room moved it. */
  const listedRoom = new Map<Draft, string>();
  const roomTitles = [...parsed.data.rooms.map((room) => room.title), ...markers.map((marker) => marker.room)];
  for (const room of parsed.data.rooms) {
    for (const item of room.items) {
      const category = normLabel(item.category) || "other";
      const name = cleanItemName(item.name, roomTitles);
      const draft: Draft = {
        key: "",
        name,
        description: item.description.trim(),
        count: item.count,
        category,
        itemType: cleanItemName(item.itemType, roomTitles) || name,
        brand: knownMark(item.brand),
        markings: knownMark(item.markings),
        wearer: asWearer(item.wearer, category),
        sizeBand: asSizeBand(item.sizeBand, category),
        color: clean(item.color),
        size: clean(item.size),
        serial: clean(item.serial),
        age: clean(item.age),
        ageYears: ageFromSpeech({ ageYears: item.ageYears, boughtYear: item.boughtYear, age: item.age, narration: item.narration }),
        ...seenCondition(item),
        likelyBrand: likelyMaker(item.brand, item.likelyBrand, item.brandClues),
        usefulLifeYears: item.usefulLifeYears ?? lifeFor(category),
        narration: clean(item.narration),
        pricePaidUsd: item.pricePaidUsd != null && item.pricePaidUsd > 0 ? item.pricePaidUsd : null,
        seenReplacementUsd: item.seenReplacementUsd != null && item.seenReplacementUsd > 0 ? item.seenReplacementUsd : null,
        roomTitle: placeRoom(room.title, item.seenAtSec ?? item.saidAtSec ?? null, markers),
        seenAt: item.seenAtSec == null ? [] : [item.seenAtSec],
        saidAtSec: item.saidAtSec ?? null,
        countSettled: item.countSettled ?? true,
        identitySettled: modelRecognized(knownMark(item.brand), knownMark(item.markings)),
        options: (item.options ?? [])
          .map((option) => ({
            label: option.label,
            lowUsd: Math.min(option.lowUsd, option.highUsd),
            highUsd: Math.max(option.lowUsd, option.highUsd),
          }))
          .slice(0, 3),
        ask: null,
      };
      if (draft.likelyBrand && !draft.brand && !draft.markings) draft.identitySettled = false;
      const packing = `${draft.description} ${draft.narration ?? ""}`;
      if (!draft.damage && /\b(unopened|sealed|brand new|original box|original packaging)\b/i.test(packing)) {
        draft.condition = "new";
        if (!/no damage seen/i.test(draft.description)) {
          draft.description = `${draft.description} New in original packaging. No damage seen.`.trim().slice(0, 400);
        }
      } else if (!draft.damage && draft.condition == null && /\bexcellent\b/i.test(packing)) {
        draft.condition = "good";
        if (!/no damage seen/i.test(draft.description)) {
          draft.description = `${draft.description} Excellent. No damage seen.`.trim().slice(0, 400);
        }
      }
      draft.ask = settledAsk(item.ask, draft.countSettled, draft.identitySettled);
      if (item.appraise === false || isNotProperty(draft.name, draft.itemType, draft.description)) continue;
      if (draft.serial && draft.markings?.includes(draft.serial)) {
        draft.markings = knownMark(draft.markings.replaceAll(draft.serial, " "));
      }
      draft.key = shouldGroup(draft)
        ? ["group", draft.category, draft.itemType, draft.wearer ?? "", draft.sizeBand ?? "", draft.size ?? "", draft.brand ?? "", draft.markings ?? ""].map(normLabel).join("|")
        : [lineKey(draft), normLabel(draft.brand ?? ""), normLabel(draft.markings ?? "")].join("|");
      const existing = drafts.find((line) => line.roomTitle === draft.roomTitle && line.key === draft.key);
      if (!existing) {
        drafts.push(draft);
        listedRoom.set(draft, room.title.trim().toLowerCase());
        continue;
      }
      // Listed under two rooms in one clip, then placed in the same tapped room: one object, not two.
      const sameObjectTwice = listedRoom.get(existing) !== room.title.trim().toLowerCase();
      const nextCount = sameObjectTwice ? Math.max(existing.count, draft.count) : existing.count + draft.count;
      if (sameObjectTwice) {
        existing.ageYears = existing.ageYears ?? draft.ageYears;
      } else if (existing.ageYears != null && draft.ageYears != null) {
        existing.ageYears = (existing.ageYears * existing.count + draft.ageYears * draft.count) / nextCount;
      } else {
        existing.ageYears = null;
      }
      existing.count = nextCount;
      if (draft.seenReplacementUsd != null) {
        existing.seenReplacementUsd = Math.max(existing.seenReplacementUsd ?? 0, draft.seenReplacementUsd);
      }
      existing.seenAt.push(...draft.seenAt);
      existing.countSettled = existing.countSettled && draft.countSettled;
      existing.identitySettled = existing.identitySettled && draft.identitySettled;
      if (existing.options.length === 0) existing.options = draft.options;
      existing.ask = existing.ask ?? draft.ask;
      existing.pricePaidUsd = existing.pricePaidUsd ?? draft.pricePaidUsd;
      existing.usefulLifeYears = existing.usefulLifeYears ?? draft.usefulLifeYears;
      existing.condition = worseCondition(existing.condition, draft.condition);
      existing.damage = worseDamage(existing.damage, draft.damage);
      existing.likelyBrand = existing.likelyBrand ?? draft.likelyBrand;
      existing.color = existing.color || draft.color;
      existing.serial = existing.serial || draft.serial;
      if (!existing.narration && draft.narration) {
        existing.narration = draft.narration;
        existing.saidAtSec = draft.saidAtSec;
      }
    }
  }

  clearSharedSightings(drafts);
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
    if (isDecor(draft)) groupedNow = false;
    // A group of one is not a group: one object is its own row, with its own description.
    else if (draft.count <= 1) groupedNow = false;
    else if (isBulkKind(draft)) groupedNow = true;
    else if (price != null && price >= GROUP_UNDER_USD) groupedNow = false;
    else if (price != null && price < GROUP_UNDER_USD && !draft.serial && !ALWAYS_ROW.has(draft.category)) groupedNow = true;
    const item = blankItem(draft, price, basis, sourceUrl, groupedNow, heard, found?.replacementUsd != null ? pricedAt : null);
    const bucket = byRoom.get(draft.roomTitle) ?? [];
    if (isDecor(draft) && draft.count > 1) {
      item.count = 1;
      bucket.push(item);
      for (let copy = 1; copy < draft.count; copy += 1) bucket.push({ ...item, id: crypto.randomUUID() });
    } else {
      bucket.push(item);
    }
    byRoom.set(draft.roomTitle, bucket);
  }

  const rooms: RoomShard[] = [...byRoom.entries()].map(([title, items]) => ({
    id: crypto.randomUUID(),
    title,
    items,
  }));

  return reviewResultSchema.parse({ rooms });
}
