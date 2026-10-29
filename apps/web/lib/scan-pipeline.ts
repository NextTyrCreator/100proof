import { HIGH_VALUE_OVER_USD, type ItemChange, type RoomItem, type RoomShard } from "./inventory";
import type { KnownSoFar, LineToPrice, LineToReconcile, ReconcileAnswer } from "./review-scan";
import {
  CATEGORIES,
  depreciate,
  httpUrl,
  lifeFor,
  normLabel,
  priceKey,
  revalue,
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

/**
 * Lines that still need a web price, one per description. The key sent is the first line's id;
 * `idsByKey` maps it back to every line with the same description. A serial is never sent.
 */
export function linesToPrice(review: ReviewResult, alreadySent: Set<string>) {
  const groups = new Map<string, RoomItem[]>();
  for (const room of review.rooms) {
    for (const item of room.items) {
      if (item.enteredBy !== "scan" || item.pricedAt != null) continue;
      const described = [item.itemType, item.brand, item.markings].filter(Boolean).join(" ");
      const key = priceKey({ name: item.name, description: described || item.detail, color: item.color, size: item.size });
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
    });
    idsByKey.set(first.id, items.map((item) => item.id));
    descriptions.push(description);
  }
  return { lines, idsByKey, descriptions };
}

function cashFor(item: RoomItem, replacement: number) {
  if (item.priceUsd != null && item.priceUsd > 0 && item.cashValueUsd != null && item.depreciationNote) {
    const share = Math.min(1, Math.max(0, item.cashValueUsd / item.priceUsd));
    return { cash: Math.round(replacement * share * 100) / 100, note: item.depreciationNote };
  }
  return depreciate(replacement, item.ageYears, lifeFor(item.category), item.condition, item.damage);
}

/** "Exact" means the brand and model on the line were read or stated. Anything else is a comparable. */
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
        const worn = cashFor(item, hit.replacementUsd);
        return {
          ...item,
          priceUsd: hit.replacementUsd,
          cashValueUsd: worn.cash,
          depreciationNote: worn.note,
          valueBasis: checkedBasis(item, hit.basis),
          sourceUrl: httpUrl(hit.sourceUrl),
          pricedAt,
          highValue: hit.replacementUsd > HIGH_VALUE_OVER_USD,
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
          brand: item.brand ?? item.likelyBrand?.name ?? null,
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
  const priceUsd = keeper.priceUsd ?? other.priceUsd;
  const damage = worseDamage(keeper.damage, other.damage);
  const condition = worseCondition(keeper.condition, other.condition);
  const ageYears = keeper.ageYears ?? other.ageYears;
  const usefulLifeYears = keeper.usefulLifeYears ?? other.usefulLifeYears;
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
    photoUrl: keeper.photoUrl ?? other.photoUrl,
    photoPath: keeper.photoPath ?? other.photoPath,
    userNote: [keeper.userNote, other.userNote].filter(Boolean).join(" ").slice(0, 500),
    priceUsd,
    cashValueUsd: keeper.priceUsd != null ? keeper.cashValueUsd : other.cashValueUsd,
    depreciationNote: keeper.priceUsd != null ? keeper.depreciationNote : other.depreciationNote,
    valueBasis: keeper.priceUsd != null ? keeper.valueBasis : other.valueBasis,
    sourceUrl: keeper.priceUsd != null ? keeper.sourceUrl : other.sourceUrl,
    pricedAt: keeper.priceUsd != null ? keeper.pricedAt : other.pricedAt,
    highValue: (priceUsd ?? 0) > HIGH_VALUE_OVER_USD,
    sightings: [...keeper.sightings, ...other.sightings].slice(-60),
    said: [...keeper.said, ...other.said.filter((fact) => !known.has(fact.text.toLowerCase()))].slice(-20),
    skipped: [...new Set([...keeper.skipped, ...other.skipped])],
    changes: [...keeper.changes, ...other.changes, entry].slice(-40),
  };
  const factsChanged =
    damage !== keeper.damage ||
    condition !== keeper.condition ||
    ageYears !== keeper.ageYears ||
    usefulLifeYears !== keeper.usefulLifeYears ||
    (keeper.priceUsd == null && priceUsd != null);
  if (factsChanged) {
    const worn = revalue(joined);
    if (worn) {
      joined.cashValueUsd = worn.cash;
      joined.depreciationNote = worn.note;
    }
  }
  return joined;
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
      keeper = joinInto(keeper, other);
      const fromRoom = where.get(other.id);
      if (fromRoom) fromRoom.items = fromRoom.items.filter((item) => item.id !== other.id);
      where.delete(other.id);
      joined += 1;
    }
    const home = where.get(keeper.id);
    if (home) home.items = home.items.map((item) => (item.id === keeper.id ? keeper : item));
  }

  return { review: { rooms: rooms.filter((room) => room.items.length > 0) }, joined, roomsFolded, fixed };
}
