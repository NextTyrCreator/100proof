import { z } from "zod";
import type { RoomItem, RoomShard } from "./inventory";
import { isDecor, normLabel } from "./review-shape";

/**
 * The same physical object listed twice, in two rooms or in two clips under two names. In test 1A the TV
 * console and "TV stand", the dresser and "wardrobe cabinet", and the TV itself were each listed twice
 * because the merge only compared lines with the same name in the same room.
 *
 * Identity decides, not the name or the room: serial, model, brand, the kind of thing, its color, and
 * the words that describe it. A pair is "sure" only on strong identity; otherwise it is a question for
 * the person. Two lines from one clip were already told apart by that clip, so they are never paired.
 */
type RepeatPair = { aId: string; bId: string; sure: boolean; reason: string };

/** What Muse Spark 1.3 said after comparing the two photos. Advice shown next to the buttons, never a merge. */
export const sameObjectCheckSchema = z.object({
  verdict: z.enum(["same", "different", "unsure"]),
  reason: z.string().max(160),
  cues: z.array(z.string().max(48)).max(4),
});

export type SameObjectVerdict = z.infer<typeof sameObjectCheckSchema>;

export const repeatQuestionSchema = z.object({
  id: z.string().uuid(),
  aId: z.string().min(1).max(80),
  bId: z.string().min(1).max(80),
  aName: z.string().trim().min(1).max(120),
  bName: z.string().trim().min(1).max(120),
  aRoom: z.string().trim().min(1).max(80),
  bRoom: z.string().trim().min(1).max(80),
  reason: z.string().trim().max(200),
  check: sameObjectCheckSchema.nullable().optional(),
});

/** The same two lines in either order. */
export function pairKey(aId: string, bId: string) {
  return [aId, bId].sort().join("|");
}

export type RepeatQuestion = z.infer<typeof repeatQuestionSchema>;

const KINDS: [RegExp, string][] = [
  [/\b(tv|television|media|entertainment)\s+(stand|console|center|centre|cabinet|unit)\b/, "tv console"],
  [/\b(tv|television)\b/, "tv"],
  [/\b(dresser|wardrobe|armoire|chest of drawers|clothes cabinet)\b/, "dresser"],
  [/\bnight ?stand\b|\bbedside table\b/, "nightstand"],
  [/\b(console|entry|entryway|hall|sofa) table\b/, "entry table"],
  [/\b(side|end|accent) table\b/, "side table"],
  [/\b(bed ?frame|queen bed|king bed|twin bed|full bed|bed)\b(?! ?(ding|sheet|set|spread))/, "bed"],
  [/\bmirror\b/, "mirror"],
  [/\b(power|squat|olympic|weight) rack\b/, "rack"],
  [/\bdumbbells?\b/, "dumbbells"],
  [/\bbarbell\b|\bcurl bar\b/, "barbell"],
  [/\b(weight|workout|exercise|adjustable) bench\b/, "bench"],
  [/\b(exercise|stationary|spin) bike\b|\bpeloton\b/, "exercise bike"],
  [/\bfoot (and leg )?massager\b/, "foot massager"],
  [/\b(tower |box |pedestal |desk |ceiling )?fan\b/, "fan"],
  [/\b(table |floor |desk )?lamp\b/, "lamp"],
  [/\b(sofa|couch|sectional|loveseat)\b/, "sofa"],
  [/\b(router|mesh wifi|wi-fi)\b/, "router"],
  [/\bhamper\b/, "hamper"],
  [/\b(radio|speaker)\b/, "speaker"],
];

/** Kinds a home often has more than one of. A match on description alone is only ever a question. */
const OFTEN_SEVERAL = new Set(["lamp", "nightstand", "side table", "mirror", "fan", "speaker", "bench", "hamper", "dumbbells", "barbell"]);

const COLOR_FAMILIES: [RegExp, string][] = [
  [/\b(black|charcoal|ebony)\b/, "black"],
  [/\b(white|ivory|cream|off-white)\b/, "white"],
  [/\b(gray|grey|silver|steel|chrome|metallic|graphite)\b/, "gray"],
  [/\b(brown|wood|walnut|oak|tan|beige|espresso|natural)\b/, "brown"],
  [/\b(red|maroon|burgundy)\b/, "red"],
  [/\b(blue|navy|teal)\b/, "blue"],
  [/\b(green|olive|sage)\b/, "green"],
  [/\b(gold|brass|yellow)\b/, "gold"],
];

const STOP = new Set([
  "a", "an", "and", "the", "with", "of", "on", "in", "for", "to", "its", "it", "is", "set", "one", "line", "about",
  "small", "large", "medium", "tall", "short", "bulk", "counted", "estimate", "walk", "piece", "pieces", "each", "under",
]);

export function kindOf(line: Pick<RoomItem, "name" | "itemType">) {
  const text = normLabel(`${line.itemType ?? ""} ${line.name}`);
  for (const [pattern, kind] of KINDS) if (pattern.test(text)) return kind;
  const words = normLabel(line.itemType || line.name).split(" ").filter((word) => word && !STOP.has(word));
  return words[words.length - 1] ?? "";
}

function colorsOf(line: Pick<RoomItem, "color" | "detail">) {
  const text = normLabel(line.color ?? "");
  const families = new Set<string>();
  for (const [pattern, family] of COLOR_FAMILIES) if (pattern.test(text)) families.add(family);
  return families;
}

function wordsOf(line: Pick<RoomItem, "name" | "detail" | "color">) {
  return new Set(
    normLabel(`${line.name} ${line.detail} ${line.color ?? ""}`)
      .split(" ")
      .filter((word) => word.length > 1 && !STOP.has(word)),
  );
}

function overlap(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function same(a: string | null | undefined, b: string | null | undefined) {
  const left = normLabel(a ?? "");
  const right = normLabel(b ?? "");
  return left !== "" && left === right;
}

function differ(a: string | null | undefined, b: string | null | undefined) {
  const left = normLabel(a ?? "");
  const right = normLabel(b ?? "");
  return left !== "" && right !== "" && left !== right;
}

function clips(line: RoomItem) {
  return new Set(line.sightings.flatMap((sighting) => (sighting.clipId ? [sighting.clipId] : [])));
}

function shareClip(a: RoomItem, b: RoomItem) {
  const left = clips(a);
  for (const clip of clips(b)) if (left.has(clip)) return true;
  return false;
}

function categoryFits(a: RoomItem, b: RoomItem) {
  const left = normLabel(a.category ?? "") || "other";
  const right = normLabel(b.category ?? "") || "other";
  return left === right || left === "other" || right === "other";
}

/** How two lines compare on identity. Null when something proves they are different objects. */
export function compareLines(a: RoomItem, b: RoomItem): { sure: boolean; reason: string; score: number } | null {
  if (a.enteredBy !== "scan" || b.enteredBy !== "scan" || a.grouped || b.grouped || a.hidden || b.hidden) return null;
  if (shareClip(a, b) || !categoryFits(a, b) || numberedTwins(a, b)) return null;
  if (differ(a.serial, b.serial) || differ(a.markings, b.markings) || differ(a.brand, b.brand)) return null;
  const kind = kindOf(a);
  if (!kind || kind !== kindOf(b)) return null;
  const colorsA = colorsOf(a);
  const colorsB = colorsOf(b);
  if (colorsA.size > 0 && colorsB.size > 0 && ![...colorsA].some((family) => colorsB.has(family))) return null;

  const words = overlap(wordsOf(a), wordsOf(b));
  const samePrice = a.priceUsd != null && a.priceUsd === b.priceUsd && a.pricedAt != null && b.pricedAt != null;
  const decor = isDecor(a) || isDecor(b) || ["art", "collectible"].includes(normLabel(a.category ?? ""));
  if (same(a.serial, b.serial)) return { sure: true, reason: "Same serial.", score: 10 };
  if (same(a.markings, b.markings)) return { sure: true, reason: "Same model.", score: 9 };
  if (same(a.brand, b.brand) && !OFTEN_SEVERAL.has(kind) && !decor) return { sure: true, reason: `Same brand and kind: ${a.brand} ${kind}.`, score: 8 };
  if (!OFTEN_SEVERAL.has(kind) && !decor && words >= 0.3) return { sure: true, reason: `Same kind (${kind}) and the descriptions match.`, score: 6 + words };
  if (!OFTEN_SEVERAL.has(kind) && !decor && samePrice && words >= 0.2) return { sure: true, reason: `Same kind (${kind}), price, and description.`, score: 6 + words };
  const brandNote = a.brand || b.brand ? ` Only one says ${a.brand ?? b.brand}.` : "";
  const why = OFTEN_SEVERAL.has(kind) || decor ? "Homes often have more than one." : "The descriptions only partly match.";
  return { sure: false, reason: `Both look like the same ${kind}. ${why}${brandNote}`.slice(0, 200), score: 2 + words };
}

/** "Vase" and "Vase 2" are how a listing names two of a kind it saw side by side. */
function numberedTwins(a: RoomItem, b: RoomItem) {
  const base = (name: string) => normLabel(name).replace(/\s+\d+$/, "");
  return a.name !== b.name && base(a.name) === base(b.name) && (/\s\d+$/.test(a.name.trim()) || /\s\d+$/.test(b.name.trim()));
}

/** Each line is paired at most once, with its best match. Sure pairs first. */
export function repeatPairs(rooms: RoomShard[]): RepeatPair[] {
  const lines = rooms.flatMap((room) => room.items);
  const found: (RepeatPair & { score: number })[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i] as RoomItem;
      const b = lines[j] as RoomItem;
      const result = compareLines(a, b);
      if (result) found.push({ aId: a.id, bId: b.id, ...result });
    }
  }
  found.sort((x, y) => Number(y.sure) - Number(x.sure) || y.score - x.score);
  const used = new Set<string>();
  const pairs: RepeatPair[] = [];
  for (const pair of found) {
    if (used.has(pair.aId) || used.has(pair.bId)) continue;
    used.add(pair.aId);
    used.add(pair.bId);
    pairs.push({ aId: pair.aId, bId: pair.bId, sure: pair.sure, reason: pair.reason });
  }
  return pairs;
}

/**
 * A Scan more walk against what is already saved: only pairs of one saved line and one new line. Lines
 * already on the inventory were checked when they were saved, so they are not paired with each other again.
 */
export function crossPairs(saved: RoomShard[], fresh: RoomShard[]): RepeatPair[] {
  const old = saved.flatMap((room) => room.items);
  const added = fresh.flatMap((room) => room.items);
  const found: (RepeatPair & { score: number })[] = [];
  for (const a of old) {
    for (const b of added) {
      const result = compareLines(a, b);
      if (result) found.push({ aId: a.id, bId: b.id, ...result });
    }
  }
  found.sort((x, y) => Number(y.sure) - Number(x.sure) || y.score - x.score);
  const used = new Set<string>();
  const pairs: RepeatPair[] = [];
  for (const pair of found) {
    if (used.has(pair.aId) || used.has(pair.bId)) continue;
    used.add(pair.aId);
    used.add(pair.bId);
    pairs.push({ aId: pair.aId, bId: pair.bId, sure: pair.sure, reason: pair.reason });
  }
  return pairs;
}

/** Pairs that were not merged become questions, with names and rooms so the page can ask without lookups. */
export function repeatQuestions(rooms: RoomShard[], pairs: RepeatPair[]): RepeatQuestion[] {
  const where = new Map<string, { line: RoomItem; room: string }>();
  for (const room of rooms) for (const line of room.items) where.set(line.id, { line, room: room.title });
  const questions: RepeatQuestion[] = [];
  for (const pair of pairs) {
    const a = where.get(pair.aId);
    const b = where.get(pair.bId);
    if (!a || !b) continue;
    questions.push({
      id: crypto.randomUUID(),
      aId: pair.aId,
      bId: pair.bId,
      aName: a.line.name.slice(0, 120),
      bName: b.line.name.slice(0, 120),
      aRoom: a.room.slice(0, 80),
      bRoom: b.room.slice(0, 80),
      reason: pair.reason.slice(0, 200),
    });
  }
  return questions.slice(0, 20);
}
