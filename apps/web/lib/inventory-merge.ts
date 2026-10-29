import { z } from "zod";
import { HIGH_VALUE_OVER_USD, type ChangeSource, type Condition, type Damage, type ItemChange, type RoomItem, type RoomShard } from "./inventory";
import { conditionSchema, damageSchema, normLabel, revalue, worseCondition, worseDamage, type ReviewResult } from "./review-shape";

export type ItemPatch = {
  userNote?: string;
  userValueUsd?: number | null;
  photoUrl?: string | null;
  photoPath?: string | null;
  priceUsd?: number | null;
  cashValueUsd?: number | null;
  depreciationNote?: string | null;
  valueBasis?: string | null;
  brand?: string | null;
  markings?: string | null;
  sourceUrl?: string | null;
  serial?: string | null;
  ageYears?: number | null;
  pricedAt?: string | null;
  identitySettled?: boolean;
  count?: number;
  countSettled?: boolean;
  condition?: Condition | null;
  damage?: Damage | null;
  usefulLifeYears?: number | null;
};

export type ReviewMode = "replace" | "append" | "continue" | "focus";

function samePiece(existing: RoomItem, item: RoomItem) {
  return (
    existing.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
    (existing.brand ?? "") === (item.brand ?? "") &&
    (existing.markings ?? "") === (item.markings ?? "") &&
    (existing.serial ?? "") === (item.serial ?? "") &&
    (existing.color ?? "") === (item.color ?? "") &&
    (existing.size ?? "") === (item.size ?? "")
  );
}

function groupedMatch(existing: RoomItem, item: RoomItem) {
  return (
    existing.grouped &&
    item.grouped &&
    existing.category === item.category &&
    existing.itemType === item.itemType &&
    existing.brand === item.brand &&
    existing.markings === item.markings &&
    existing.wearer === item.wearer &&
    existing.sizeBand === item.sizeBand
  );
}

/** Same kind of thing, for a clip filmed to settle one line. */
function sameKind(existing: RoomItem, item: RoomItem) {
  const a = normLabel(existing.itemType || existing.name);
  const b = normLabel(item.itemType || item.name);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a) || normLabel(existing.name).includes(b) || normLabel(item.name).includes(a);
}

const TRACKED = [
  "count",
  "countSettled",
  "identitySettled",
  "brand",
  "markings",
  "serial",
  "priceUsd",
  "cashValueUsd",
  "userValueUsd",
  "ageYears",
  "valueBasis",
  "category",
  "condition",
] as const;

function damageText(damage: Damage | null) {
  return damage ? `${damage.severity}: ${damage.note}`.slice(0, 400) : null;
}

function change(before: RoomItem, after: RoomItem, source: ChangeSource, evidenceRef: string | null): ItemChange | null {
  const was: ItemChange["before"] = {};
  const now: ItemChange["after"] = {};
  for (const key of TRACKED) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (a !== b) {
      was[key] = typeof a === "string" ? a.slice(0, 400) : a;
      now[key] = typeof b === "string" ? b.slice(0, 400) : b;
    }
  }
  if (damageText(before.damage) !== damageText(after.damage)) {
    was.damage = damageText(before.damage);
    now.damage = damageText(after.damage);
  }
  if (Object.keys(now).length === 0) return null;
  return { id: crypto.randomUUID(), at: new Date().toISOString(), source, evidenceRef, before: was, after: now };
}

export function withChange(before: RoomItem, after: RoomItem, source: ChangeSource, evidenceRef: string | null): RoomItem {
  const entry = change(before, after, source, evidenceRef);
  if (!entry) return after;
  return { ...after, changes: [...after.changes, entry].slice(-40) };
}

function addSightings(match: RoomItem, item: RoomItem) {
  match.sightings = [...match.sightings, ...item.sightings].slice(-60);
  const known = new Set(match.said.map((fact) => fact.text.toLowerCase()));
  match.said = [...match.said, ...item.said.filter((fact) => !known.has(fact.text.toLowerCase()))].slice(-20);
}

/** Damage or a worse condition seen in a later clip stays on the line and lowers its cash value. */
function adoptCondition(match: RoomItem, item: RoomItem) {
  const damage = worseDamage(match.damage, item.damage);
  const condition = worseCondition(match.condition, item.condition);
  if (!match.brand && !match.likelyBrand && item.likelyBrand) match.likelyBrand = item.likelyBrand;
  if (damage === match.damage && condition === match.condition) return;
  match.damage = damage;
  match.condition = condition;
  const worn = revalue(match);
  if (worn) {
    match.cashValueUsd = worn.cash;
    match.depreciationNote = worn.note;
  }
}

function adoptIdentity(match: RoomItem, item: RoomItem) {
  match.identitySettled = true;
  match.brand = item.brand ?? match.brand;
  match.markings = item.markings ?? match.markings;
  match.serial = item.serial ?? match.serial;
  match.options = [];
  if (item.priceUsd != null) {
    match.priceUsd = item.priceUsd;
    match.cashValueUsd = item.cashValueUsd;
    match.depreciationNote = item.depreciationNote;
    match.valueBasis = item.valueBasis;
    match.sourceUrl = item.sourceUrl;
    match.pricedAt = item.pricedAt;
    match.highValue = item.priceUsd > HIGH_VALUE_OVER_USD;
  }
  if (match.ask?.kind === "label") match.ask = null;
}

export function mergeRooms(
  current: RoomShard[],
  incoming: RoomShard[],
  mode: Exclude<ReviewMode, "replace">,
  focusIds: string[] = [],
): RoomShard[] {
  const rooms = current.map((room) => ({ ...room, items: room.items.map((item) => ({ ...item })) }));
  const focused = new Set(focusIds);

  for (const next of incoming) {
    for (const item of next.items) {
      if (mode === "focus" && focused.size > 0) {
        const target = rooms
          .flatMap((room) => room.items)
          .find((existing) => focused.has(existing.id) && sameKind(existing, item));
        if (target) {
          const before = { ...target };
          addSightings(target, item);
          target.count = item.count;
          target.countSettled = item.countSettled;
          if (!target.identitySettled && item.identitySettled) adoptIdentity(target, item);
          adoptCondition(target, item);
          if (target.countSettled && target.ask?.kind === "wider") target.ask = null;
          const entry = change(before, target, "clip", item.sightings[0]?.clipId ?? null);
          if (entry) target.changes = [...target.changes, entry].slice(-40);
          focused.delete(target.id);
          continue;
        }
      }

      const room = rooms.find((entry) => entry.title.trim().toLowerCase() === next.title.trim().toLowerCase());
      if (!room) {
        const fresh = rooms.find((entry) => entry.id === next.id);
        if (fresh) fresh.items.push(item);
        else rooms.push({ ...next, items: [item] });
        continue;
      }
      const continued = mode === "continue" || mode === "focus";
      const match = item.grouped
        ? room.items.find((existing) => groupedMatch(existing, item))
        : continued
          ? room.items.find((existing) => !existing.grouped && samePiece(existing, item))
          : undefined;
      if (!match) {
        room.items.push(item);
        continue;
      }
      const before = { ...match };
      addSightings(match, item);
      if (item.grouped && !continued) {
        match.count += item.count;
        match.countSettled = match.countSettled && item.countSettled;
      } else {
        const agrees = item.count === match.count;
        if (item.count > match.count) {
          match.count = item.count;
          match.countSettled = item.countSettled;
        } else if (agrees) {
          match.countSettled = match.countSettled || item.countSettled;
        }
      }
      if (!match.identitySettled && item.identitySettled) adoptIdentity(match, item);
      if (!match.grouped) adoptCondition(match, item);
      const settled = change(before, match, "clip", item.sightings[0]?.clipId ?? null);
      if (settled && ("countSettled" in settled.after || "identitySettled" in settled.after || "damage" in settled.after)) {
        match.changes = [...match.changes, settled].slice(-40);
      }
    }
  }
  return rooms;
}

/** Evidence that arrives while the session is still filming, before the lines are on the inventory. */
export function patchReviewItem(
  review: ReviewResult,
  itemId: string,
  patch: ItemPatch,
  source: ChangeSource,
  evidenceRef: string | null,
): ReviewResult {
  return {
    rooms: review.rooms.map((room) => ({
      ...room,
      items: room.items.map((item) => {
        if (item.id !== itemId) return item;
        const next = applyPatch(item, patch);
        return next ? withChange(item, next, source, evidenceRef) : item;
      }),
    })),
  };
}

export function combinePieceReviews(base: ReviewResult, next: ReviewResult): ReviewResult {
  return { rooms: mergeRooms(base.rooms, next.rooms, "continue") };
}

/** Put the clip id on each sighting and quote that came back from that clip. */
export function tagReview(review: ReviewResult, clipId: string): ReviewResult {
  return {
    rooms: review.rooms.map((room) => ({
      ...room,
      items: room.items.map((item) => ({
        ...item,
        sightings: item.sightings.map((sighting) => ({ ...sighting, clipId: sighting.clipId ?? clipId })),
        said: item.said.map((fact) => ({ ...fact, clipId: fact.clipId ?? clipId })),
        damage: item.damage ? { ...item.damage, clipId: item.damage.clipId ?? clipId } : null,
      })),
    })),
  };
}

function money(value: number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return { success: true as const, data: null };
  return z.number().finite().nonnegative().max(1_000_000).safeParse(value);
}

function nullableText(value: string | null | undefined, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return { success: true as const, data: null };
  return z.string().trim().max(max).safeParse(value);
}

/** Every field in a patch is checked before it reaches the line. */
export function applyPatch(item: RoomItem, patch: ItemPatch): RoomItem | null {
  const note = patch.userNote === undefined ? undefined : z.string().max(500).safeParse(patch.userNote);
  const price = money(patch.userValueUsd);
  const replacement = money(patch.priceUsd);
  const cash = money(patch.cashValueUsd);
  const photo = nullableText(patch.photoUrl, 2_000);
  const photoPath = nullableText(patch.photoPath, 300);
  const basis = nullableText(patch.valueBasis, 300);
  const brand = nullableText(patch.brand, 80);
  const markings = nullableText(patch.markings, 160);
  const worn = nullableText(patch.depreciationNote, 300);
  const source = nullableText(patch.sourceUrl, 300);
  const serial = nullableText(patch.serial, 80);
  const pricedAt = nullableText(patch.pricedAt, 40);
  const ageYears =
    patch.ageYears === undefined
      ? undefined
      : patch.ageYears === null
        ? { success: true as const, data: null }
        : z.number().finite().nonnegative().max(100).safeParse(patch.ageYears);
  const count = patch.count === undefined ? undefined : z.number().int().positive().max(999).safeParse(patch.count);
  const condition = patch.condition === undefined ? undefined : conditionSchema.nullable().safeParse(patch.condition);
  const damage = patch.damage === undefined ? undefined : damageSchema.nullable().safeParse(patch.damage);
  const usefulLifeYears =
    patch.usefulLifeYears === undefined
      ? undefined
      : patch.usefulLifeYears === null
        ? { success: true as const, data: null }
        : z.number().finite().positive().max(80).safeParse(patch.usefulLifeYears);
  const checks = [note, price, replacement, cash, photo, photoPath, basis, brand, markings, worn, source, serial, pricedAt, ageYears, count, condition, damage, usefulLifeYears];
  if (checks.some((check) => check && !check.success)) return null;
  const next: RoomItem = {
    ...item,
    userNote: note?.success ? note.data : item.userNote,
    userValueUsd: price?.success ? price.data : item.userValueUsd,
    photoUrl: photo?.success ? photo.data : item.photoUrl,
    photoPath: photoPath?.success ? photoPath.data : item.photoPath,
    priceUsd: replacement?.success ? replacement.data : item.priceUsd,
    cashValueUsd: cash?.success ? cash.data : item.cashValueUsd,
    depreciationNote: worn?.success ? worn.data || null : item.depreciationNote,
    valueBasis: basis?.success ? basis.data || null : item.valueBasis,
    brand: brand?.success ? brand.data || null : item.brand,
    markings: markings?.success ? markings.data || null : item.markings,
    sourceUrl: source?.success ? source.data : item.sourceUrl,
    serial: serial?.success ? serial.data : item.serial,
    ageYears: ageYears?.success ? ageYears.data : item.ageYears,
    pricedAt: pricedAt?.success ? pricedAt.data : item.pricedAt,
    count: count?.success ? count.data : item.count,
    countSettled: patch.countSettled ?? item.countSettled,
    identitySettled: patch.identitySettled ?? item.identitySettled,
    condition: condition?.success ? condition.data : item.condition,
    damage: damage?.success ? damage.data : item.damage,
    usefulLifeYears: usefulLifeYears?.success ? usefulLifeYears.data : item.usefulLifeYears,
  };
  if (next.damage) next.condition = "damaged";
  if (next.brand) next.likelyBrand = null;
  next.highValue = (next.priceUsd ?? 0) > HIGH_VALUE_OVER_USD;
  if (next.identitySettled) next.options = [];
  if (next.identitySettled && next.ask?.kind === "label") next.ask = null;
  if (next.countSettled && next.ask?.kind === "wider") next.ask = null;
  return next;
}
