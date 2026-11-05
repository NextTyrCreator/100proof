import { HIGH_VALUE_OVER_USD, type ItemChange, type RoomItem, type RoomShard } from "./inventory";
import { APPRAISAL_BASIS, appraisalDocumented, statedUsd } from "./line-confidence";
import type { KnownSoFar, LineToPrice, LineToReconcile, ReconcileAnswer } from "./review-scan";
import {
  CATEGORIES,
  depreciate,
  httpUrl,
  lifeFor,
  normLabel,
  priceKey,
  revalue,
  isNotProperty,
  modelRecognized,
  worseCondition,
  worseDamage,
  type PricedLine,
  type ReviewResult,
} from "./review-shape";

/** The rooms and lines already listed, so the next clip names the same object the same way. */
export function knownSoFar(review: ReviewResult | null): KnownSoFar {
  if (!review) return { rooms: [], lines: [] };
  const rooms = review.rooms.map((room) => room.title.slice(0, 80)).slice(0, 20);
  const items = review.rooms.flatMap((room) => room.items.map((item) => ({ room: room.title, item })));
  const ordered = [...items.filter(({ item }) => !item.grouped), ...items.filter(({ item }) => item.grouped)];
  const lines = ordered.slice(0, 80).map(({ room, item }) => `${room}: ${item.name}`.slice(0, 200));
  return { rooms, lines };
}

function withoutSerial(text: string, serial: string | null) {
  return serial ? text.replaceAll(serial, " ").replace(/\s+/g, " ").trim() : text;
}

function priceGroupKey(item: RoomItem) {
  const described = [item.itemType, item.brand, item.markings, item.detail].filter(Boolean).join(" ");
  return priceKey({ name: item.name, description: described || item.detail, color: item.color, size: item.size });
}

/**
 * A line listed again after its description was already priced never gets its own search.
 * It inherits the checked price, then its own age and damage set the cash value.
 */
export function shareKnownPrices(review: ReviewResult): ReviewResult {
  const donors = new Map<string, RoomItem>();
  for (const room of review.rooms) {
    for (const item of room.items) {
      if (item.enteredBy !== "scan" || item.pricedAt == null || item.priceUsd == null) continue;
      const key = priceGroupKey(item);
      if (!donors.has(key)) donors.set(key, item);
    }
  }
  if (donors.size === 0) return review;
  let changed = false;
  const rooms = review.rooms.map((room) => ({
    ...room,
    items: room.items.map((item) => {
      if (item.enteredBy !== "scan" || item.pricedAt != null) return item;
      const donor = donors.get(priceGroupKey(item));
      if (!donor || donor.id === item.id || donor.priceUsd == null) return item;
      changed = true;
      const worn = cashFor(item, donor.priceUsd);
      return {
        ...item,
        priceUsd: donor.priceUsd,
        cashValueUsd: worn.cash,
        depreciationNote: worn.note,
        valueBasis: donor.valueBasis ? checkedBasis(item, donor.valueBasis) : item.valueBasis,
        sourceUrl: donor.sourceUrl,
        pricedAt: donor.pricedAt,
        highValue: donor.priceUsd > HIGH_VALUE_OVER_USD,
      };
    }),
  }));
  return changed ? { rooms } : review;
}

/**
 * Lines that still need a web price, one per description. The key sent is the first line's id;
 * `idsByKey` maps it back to every line with the same description. A serial is never sent.
 */
export function linesToPrice(review: ReviewResult, alreadySent: Set<string>) {
  const groups = new Map<string, RoomItem[]>();
  for (const room of review.rooms) {
    for (const item of room.items) {
      if (item.enteredBy !== "scan" || item.pricedAt != null) continue;
      if (isNotProperty(item.name, item.itemType ?? "", item.detail)) continue;
      const key = priceGroupKey(item);
      if (alreadySent.has(key)) continue;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
  }
  const lines: LineToPrice[] = [];
  const idsByKey = new Map<string, string[]>();
  const descriptions: string[] = [];
  for (const [description, items] of groups) {
    const first = items[0];
    if (!first) continue;
    const text = withoutSerial([first.itemType, first.detail].filter(Boolean).join(" — "), first.serial).slice(0, 400);
    lines.push({
      key: first.id,
      name: withoutSerial(first.name, first.serial).slice(0, 120) || first.name,
      description: text,
      category: first.category,
      brand: first.brand,
      likelyBrand: first.brand ? null : (first.likelyBrand?.name ?? null),
      markings: first.markings ? withoutSerial(first.markings, first.serial) || null : null,
      color: first.color,
      size: first.size,
      options: first.identitySettled ? [] : first.options.slice(0, 3),
      paidUsd: statedUsd(first),
    });
    idsByKey.set(first.id, items.map((item) => item.id));
    descriptions.push(description);
  }
  return { lines, idsByKey, descriptions };
}

function cashFor(item: RoomItem, replacement: number) {
  const life = item.usefulLifeYears ?? lifeFor(item.category);
  // A line with damage is depreciated again, so a full-price share cannot hide the damage.
  if (item.priceUsd != null && item.priceUsd > 0 && item.cashValueUsd != null && item.depreciationNote && !item.damage) {
    const share = Math.min(1, Math.max(0, item.cashValueUsd / item.priceUsd));
    return { cash: Math.round(replacement * share * 100) / 100, note: item.depreciationNote };
  }
  return depreciate(replacement, item.ageYears, life, item.condition, item.damage);
}

/**
 * A documented appraisal is the value. Otherwise the comparable is kept as found. A stated price outside
 * half to double of it is not clamped to a number no page shows; the line is held at 50% and asks instead.
 */
export function pricedFrom(item: RoomItem, proposed: number) {
  if (appraisalDocumented(item) && item.appraisalUsd != null) return { price: item.appraisalUsd, appraisal: true };
  return { price: proposed, appraisal: false };
}
function checkedBasis(item: RoomItem, basis: string) {
  const text = basis.trim().slice(0, 300) || "Local replacement.";
  const confirmed = item.identitySettled && Boolean(item.brand || item.markings);
  if (confirmed || !/^exact:/i.test(text)) return text;
  return `Comparable:${text.replace(/^exact:/i, "")}`.slice(0, 300);
}

/** Put web prices on the lines. A line's depreciation share is kept; a line with none is depreciated by its age. */
export function applyPrices(
  review: ReviewResult,
  priced: PricedLine[],
  idsByKey: Map<string, string[]>,
  pricedAt = new Date().toISOString(),
): ReviewResult {
  const byId = new Map<string, PricedLine>();
  for (const line of priced) {
    if (line.replacementUsd == null) continue;
    for (const id of idsByKey.get(line.key) ?? []) byId.set(id, line);
  }
  if (byId.size === 0) return review;
  return {
    rooms: review.rooms.map((room) => ({
      ...room,
      items: room.items.map((item) => {
        const hit = byId.get(item.id);
        if (!hit || hit.replacementUsd == null) return item;
        const bounded = pricedFrom(item, hit.replacementUsd);
        const worn = cashFor(item, bounded.price);
        return {
          ...item,
          priceUsd: bounded.price,
          cashValueUsd: worn.cash,
          depreciationNote: worn.note,
          valueBasis: bounded.appraisal ? APPRAISAL_BASIS : checkedBasis(item, hit.basis),
          sourceUrl: bounded.appraisal ? item.sourceUrl : httpUrl(hit.sourceUrl),
          pricedAt,
          highValue: bounded.price > HIGH_VALUE_OVER_USD,
        };
      }),
    })),
  };
}

/** The finished list as text for the repeat check: no media, no serials, no addresses. */
export function reconcileInput(review: ReviewResult, clipNumber: (clipId: string) => number | undefined): LineToReconcile[] {
  return review.rooms.flatMap((room) =>
    room.items
      .filter((item) => item.enteredBy === "scan")
      .map((item) => {
        const clips = [
          ...new Set(item.sightings.flatMap((sighting) => (sighting.clipId ? [clipNumber(sighting.clipId)] : [])).filter((n): n is number => n != null)),
        ]
          .sort((a, b) => a - b)
          .slice(0, 20);
        return {
          id: item.id,
          room: room.title.slice(0, 80),
          name: item.name.slice(0, 120),
          kind: (item.itemType ?? "").slice(0, 80),
          category: normLabel(item.category ?? "") || "other",
          brand: item.brand,
          clips,
          said: item.said[0]?.text.slice(0, 160) ?? null,
        };
      }),
  );
}

function clipSet(item: RoomItem) {
  return new Set(item.sightings.flatMap((sighting) => (sighting.clipId ? [sighting.clipId] : [])));
}

/** Two lines listed from the same clip were already told apart by that clip's review. */
function canJoin(a: RoomItem, b: RoomItem) {
  if ((normLabel(a.category ?? "") || "other") !== (normLabel(b.category ?? "") || "other")) return false;
  if (a.serial && b.serial && a.serial !== b.serial) return false;
  const left = clipSet(a);
  for (const clip of clipSet(b)) if (left.has(clip)) return false;
  return true;
}

function evidenceWeight(item: RoomItem) {
  return (
    (item.identitySettled ? 8 : 0) +
    (item.brand ? 4 : 0) +
    (item.markings ? 2 : 0) +
    (item.valueBasis?.startsWith("Exact:") ? 2 : 0) +
    (item.userValueUsd != null ? 2 : 0) +
    (item.serial ? 2 : 0) +
    (item.said.length > 0 ? 1 : 0) +
    item.sightings.length * 0.25
  );
}

function joinInto(keeper: RoomItem, other: RoomItem): RoomItem {
  const known = new Set(keeper.said.map((fact) => fact.text.toLowerCase()));
  const count = Math.max(keeper.count, other.count);
  const countSettled =
    keeper.count === other.count ? keeper.countSettled || other.countSettled : keeper.count > other.count ? keeper.countSettled : other.countSettled;
  const entry: ItemChange = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    source: "clip",
    evidenceRef: other.sightings.find((sighting) => sighting.clipId)?.clipId ?? null,
    before: { sameObjectAs: other.name.slice(0, 400), count: keeper.count },
    after: { sameObjectAs: keeper.name.slice(0, 400), count },
  };
  const damage = worseDamage(keeper.damage, other.damage);
  const condition = worseCondition(keeper.condition, other.condition);
  const ageYears = keeper.ageYears ?? other.ageYears;
  const usefulLifeYears = keeper.usefulLifeYears ?? other.usefulLifeYears;
  const webChecked = (line: RoomItem) => line.pricedAt != null && line.priceUsd != null;
  const priceFrom = webChecked(keeper) ? keeper : webChecked(other) ? other : keeper.priceUsd != null ? keeper : other;
  const priceUsd = priceFrom.priceUsd;
  const joined: RoomItem = {
    ...keeper,
    damage,
    condition,
    likelyBrand: keeper.brand || other.brand ? null : (keeper.likelyBrand ?? other.likelyBrand),
    count,
    countSettled,
    brand: keeper.brand ?? other.brand,
    markings: keeper.markings ?? other.markings,
    serial: keeper.serial ?? other.serial,
    ageYears,
    usefulLifeYears,
    age: keeper.age ?? other.age,
    narration: keeper.narration ?? other.narration,
    userValueUsd: keeper.userValueUsd ?? other.userValueUsd,
    appraisalUsd: keeper.appraisalUsd ?? other.appraisalUsd,
    appraisalFileId: keeper.appraisalFileId ?? other.appraisalFileId,
    photoUrl: keeper.photoUrl ?? other.photoUrl,
    photoPath: keeper.photoPath ?? other.photoPath,
    files: [...keeper.files, ...other.files.filter((file) => !keeper.files.some((kept) => kept.id === file.id))].slice(0, 8),
    declared: keeper.declared || other.declared,
    userNote: [keeper.userNote, other.userNote].filter(Boolean).join(" ").slice(0, 500),
    priceUsd,
    cashValueUsd: priceFrom.cashValueUsd,
    depreciationNote: priceFrom.depreciationNote,
    valueBasis: priceFrom.valueBasis,
    sourceUrl: priceFrom.sourceUrl,
    pricedAt: priceFrom.pricedAt,
    highValue: (priceUsd ?? 0) > HIGH_VALUE_OVER_USD,
    sightings: [...keeper.sightings, ...other.sightings].slice(-60),
    said: [...keeper.said, ...other.said.filter((fact) => !known.has(fact.text.toLowerCase()))].slice(-20),
    skipped: [...new Set([...keeper.skipped, ...other.skipped])],
    changes: [...keeper.changes, ...other.changes, entry].slice(-40),
  };
  const factsChanged =
    damage !== priceFrom.damage ||
    condition !== priceFrom.condition ||
    ageYears !== priceFrom.ageYears ||
    usefulLifeYears !== priceFrom.usefulLifeYears;
  if (joined.valueBasis) joined.valueBasis = checkedBasis(joined, joined.valueBasis);
  if (factsChanged) {
    const worn = revalue(joined);
    if (worn) {
      joined.cashValueUsd = worn.cash;
      joined.depreciationNote = worn.note;
    }
  }
  return joined;
}

function keptMark(value: string | null | undefined, max: number) {
  const text = (value ?? "").trim();
  if (!text || /^(none|unknown|n\/a|na|null)$/i.test(text)) return null;
  return text.slice(0, max);
}

/** Fill brand, model, serial, color, and detail only where the line is still empty, then send a changed identity back to be priced. */
function applyMarks(rooms: RoomShard[], marks: NonNullable<ReconcileAnswer["marks"]>) {
  const byId = new Map(marks.map((mark) => [mark.id, mark]));
  for (const room of rooms) {
    room.items = room.items.map((item) => {
      const mark = byId.get(item.id);
      if (!mark || item.enteredBy !== "scan") return item;
      const heardBrand = keptMark(mark.brand, 80);
      const brand =
        item.brand || !heardBrand || heardBrand.toLowerCase() === item.likelyBrand?.name.toLowerCase() ? null : heardBrand;
      const markings = item.markings ? null : keptMark(mark.markings, 160);
      const serial = item.serial ? null : keptMark(mark.serial, 80);
      const color = item.color ? null : keptMark(mark.color, 40);
      const detail = !item.detail || item.detail === item.name ? keptMark(mark.detail, 400) : null;
      if (!brand && !markings && !serial && !color && !detail) return item;
      const next: RoomItem = { ...item };
      const before: ItemChange["before"] = {};
      const after: ItemChange["after"] = {};
      if (brand) {
        next.brand = brand;
        next.likelyBrand = null;
        before.brand = item.brand;
        after.brand = brand;
      }
      if (markings) {
        next.markings = markings;
        before.markings = item.markings;
        after.markings = markings;
        if (!(detail ?? "").toLowerCase().startsWith("likely model")) next.identitySettled = modelRecognized(next.brand, next.markings);
      }
      if (serial) {
        next.serial = serial;
        before.serial = item.serial;
        after.serial = serial;
      }
      if (color) next.color = color;
      if (detail) next.detail = detail;
      if (brand || markings || color || detail) next.pricedAt = null;
      if (Object.keys(after).length > 0) {
        next.changes = [
          ...item.changes,
          { id: crypto.randomUUID(), at: new Date().toISOString(), source: "check" as const, evidenceRef: null, before, after },
        ].slice(-40);
      }
      return next;
    });
  }
}

const KNOWN_CATEGORIES = new Set<string>(CATEGORIES);

/** The check at Done may move a line to the right category. Only a listed category is accepted, and it is logged. */
function applyFixes(rooms: RoomShard[], fixes: NonNullable<ReconcileAnswer["fix"]>) {
  let fixed = 0;
  const byId = new Map(fixes.map((fix) => [fix.id, normLabel(fix.category)]));
  for (const room of rooms) {
    room.items = room.items.map((item) => {
      const category = byId.get(item.id);
      if (!category || item.enteredBy !== "scan" || !KNOWN_CATEGORIES.has(category)) return item;
      const was = normLabel(item.category ?? "") || "other";
      if (category === was) return item;
      fixed += 1;
      const entry: ItemChange = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        source: "check",
        evidenceRef: null,
        before: { category: was },
        after: { category },
      };
      const next: RoomItem = {
        ...item,
        category,
        usefulLifeYears: lifeFor(category),
        changes: [...item.changes, entry].slice(-40),
      };
      const worn = revalue(next);
      if (worn) {
        if (worn.cash !== item.cashValueUsd) {
          entry.before.cashValueUsd = item.cashValueUsd;
          entry.after.cashValueUsd = worn.cash;
        }
        next.cashValueUsd = worn.cash;
        next.depreciationNote = worn.note;
      }
      return next;
    });
  }
  return fixed;
}

/**
 * Apply the repeat check. The model proposes; these rules decide: same category, never two lines from one clip,
 * never two serials, and the line with the most evidence is kept with the larger count.
 */
export function applyReconcile(
  review: ReviewResult,
  answer: ReconcileAnswer,
): { review: ReviewResult; joined: number; roomsFolded: number; fixed: number } {
  const titles = new Map(review.rooms.map((room) => [room.title.trim().toLowerCase(), room.title]));
  const fold = new Map<string, string>();
  for (const { from, to } of answer.rooms) {
    const a = from.trim().toLowerCase();
    const b = to.trim().toLowerCase();
    if (a !== b && titles.has(a) && titles.has(b)) fold.set(a, b);
  }
  const finalTitle = (title: string) => {
    let key = title.trim().toLowerCase();
    for (let hops = 0; hops < 5 && fold.has(key); hops += 1) key = fold.get(key) as string;
    return titles.get(key) ?? title;
  };

  const rooms: RoomShard[] = [];
  let roomsFolded = 0;
  for (const room of review.rooms) {
    const title = finalTitle(room.title);
    const into = rooms.find((entry) => entry.title.trim().toLowerCase() === title.trim().toLowerCase());
    if (into) {
      into.items = [...into.items, ...room.items.map((item) => ({ ...item }))];
      roomsFolded += 1;
    } else {
      rooms.push({ ...room, title, items: room.items.map((item) => ({ ...item })) });
    }
  }

  const fixed = applyFixes(rooms, answer.fix ?? []);
  applyMarks(rooms, answer.marks ?? []);

  const where = new Map<string, RoomShard>();
  for (const room of rooms) for (const item of room.items) where.set(item.id, room);
  const find = (id: string) => where.get(id)?.items.find((item) => item.id === id) ?? null;

  let joined = 0;
  for (const group of answer.same) {
    const members = [...new Set(group)].map(find).filter((item): item is RoomItem => item != null && item.enteredBy === "scan");
    if (members.length < 2) continue;
    members.sort((a, b) => evidenceWeight(b) - evidenceWeight(a));
    let keeper = members[0] as RoomItem;
    const accepted: RoomItem[] = [keeper];
    for (const other of members.slice(1)) {
      if (!accepted.every((member) => canJoin(member, other))) continue;
      accepted.push(other);
      keeper = absorb(where, keeper, other);
      joined += 1;
    }
    const home = where.get(keeper.id);
    if (home) home.items = home.items.map((item) => (item.id === keeper.id ? keeper : item));
  }

  return { review: { rooms: rooms.filter((room) => room.items.length > 0) }, joined, roomsFolded, fixed };
}

/** Join one line into another and note the other room when the object was seen in two. */
function absorb(where: Map<string, RoomShard>, keeper: RoomItem, other: RoomItem) {
  let next = joinInto(keeper, other);
  const home = where.get(keeper.id);
  const fromRoom = where.get(other.id);
  if (home && fromRoom && home.title.trim().toLowerCase() !== fromRoom.title.trim().toLowerCase()) {
    const note = `Also seen in ${fromRoom.title}.`;
    if (!next.detail.includes(note)) next = { ...next, detail: `${next.detail} ${note}`.trim().slice(0, 400) };
    const last = next.changes[next.changes.length - 1];
    if (last) {
      last.before = { ...last.before, room: fromRoom.title.slice(0, 80) };
      last.after = { ...last.after, room: home.title.slice(0, 80) };
    }
  }
  if (fromRoom) fromRoom.items = fromRoom.items.filter((item) => item.id !== other.id);
  where.delete(other.id);
  return next;
}

/**
 * Merge the sure pairs from the identity rules (`repeat-match.ts`). Those rules already refuse two serials,
 * two models, two brands, two colors, and one clip, and allow a line filed as "other" to join its kind.
 */
export function joinSurePairs(review: ReviewResult, pairs: { aId: string; bId: string }[]) {
  let next = review;
  let joined = 0;
  for (const pair of pairs) {
    const result = joinRepeatPair(next, pair.aId, pair.bId);
    if (!result.joined) continue;
    next = result.review;
    joined += 1;
  }
  return { review: next, joined };
}

/**
 * The person said two lines are one object. Their answer is the evidence, so only a line that is gone
 * stops it. The line with more evidence is kept, with the larger count, the better photo, and both rooms.
 */
export function joinRepeatPair(review: ReviewResult, aId: string, bId: string): { review: ReviewResult; joined: boolean; keptId: string | null } {
  const rooms: RoomShard[] = review.rooms.map((room) => ({ ...room, items: room.items.map((item) => ({ ...item })) }));
  const where = new Map<string, RoomShard>();
  for (const room of rooms) for (const item of room.items) where.set(item.id, room);
  const a = where.get(aId)?.items.find((item) => item.id === aId);
  const b = where.get(bId)?.items.find((item) => item.id === bId);
  if (!a || !b || aId === bId) return { review, joined: false, keptId: null };
  const [first, second] = evidenceWeight(a) >= evidenceWeight(b) ? [a, b] : [b, a];
  const keeper = absorb(where, first, second);
  const home = where.get(keeper.id);
  if (home) home.items = home.items.map((item) => (item.id === keeper.id ? keeper : item));
  return { review: { rooms: rooms.filter((room) => room.items.length > 0) }, joined: true, keptId: keeper.id };
}
