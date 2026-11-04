import { matchLines, type TruthLine } from "./eval-score";
import type { HomeInventory, RoomItem } from "./inventory";

/** The house this study repeats. Yards are part of the walk, not extra credit. */
export const HOUSE_STUDY = {
  livingSqFt: 2600,
  yards: ["front", "back"] as const,
  /** Unit replacement on the reviewer's list. Jewelry is left out of this check. */
  recoverOverUsd: 250,
  /** Same band the eval uses for a price that is close enough. */
  priceBand: 0.25,
  /** A new-user time is not stated until this many finished walks are in the log. */
  walksBeforeAverage: 3,
};

type StudyTruth = {
  name: string;
  aliases?: string[];
  count: number;
  brand?: string | null;
  model?: string | null;
  replacementUsd?: number | null;
  /** jewelry is excluded from the over-$250 recovery check. */
  category?: string | null;
  /** The reviewer could see it in the video. False means it should not be on the list. */
  inVideo?: boolean;
};

function isJewelry(category: string | null | undefined) {
  return (category ?? "").trim().toLowerCase() === "jewelry";
}

/** A receipt or a Connections match has not been applied to this line. */
function beforeConnections(item: RoomItem) {
  return !item.changes.some((entry) => entry.source === "receipt photo");
}

function seen(item: RoomItem) {
  return item.sightings.length > 0;
}

/**
 * Score one walk of the study house against a list written from the video.
 * Prices count only on lines that still have no receipt. Jewelry is not in the over-$250 check.
 */
export function scoreHouseWalk(inventory: HomeInventory, truth: StudyTruth[]) {
  const lines = inventory.rooms.flatMap((room) => room.items);
  const listed: TruthLine[] = truth.map((want) => ({
    name: want.name,
    aliases: want.aliases ?? [],
    count: want.count,
    brand: want.brand ?? null,
    model: want.model ?? null,
    replacementUsd: want.replacementUsd ?? null,
  }));
  const matched = matchLines(listed, lines);
  const used = new Set(matched.values());

  const priced = truth.flatMap((want, index) => {
    const line = lines[matched.get(index) ?? -1];
    if (want.inVideo === false || !line || want.replacementUsd == null || want.replacementUsd <= 0 || line.priceUsd == null) return [];
    if (!beforeConnections(line)) return [];
    const error = Math.abs(line.priceUsd - want.replacementUsd) / want.replacementUsd;
    return [{ name: want.name, error: Math.round(error * 1000) / 1000, close: error <= HOUSE_STUDY.priceBand }];
  });

  const recover = truth.flatMap((want, index) =>
    want.inVideo !== false && (want.replacementUsd ?? 0) > HOUSE_STUDY.recoverOverUsd && !isJewelry(want.category) ? [{ want, index }] : [],
  );
  const recovered = recover.filter(({ index }) => {
    const line = lines[matched.get(index) ?? -1];
    return line != null && seen(line);
  });
  const missed = recover.filter((row) => !recovered.includes(row)).map((row) => row.want.name);

  const missingNames = truth.filter((want, index) => want.inVideo !== false && !matched.has(index)).map((want) => want.name);
  const extras = lines.filter((_, index) => !used.has(index)).map((line) => line.name);
  const falseCaptures = truth.filter((want, index) => want.inVideo === false && matched.has(index)).map((want) => want.name);

  const filmedSeconds = Math.round(inventory.clips.reduce((sum, clip) => sum + clip.durationMs, 0) / 1000);
  const close = priced.filter((row) => row.close).length;

  return {
    filmedMinutes: Math.round((filmedSeconds / 60) * 10) / 10,
    lines: lines.length,
    truthLines: truth.length,
    missing: missingNames,
    extras,
    falseCaptures,
    priceChecked: priced.length,
    priceWithinBand: close,
    priceWithinBandShare: priced.length === 0 ? null : Math.round((close / priced.length) * 1000) / 1000,
    recoverChecked: recover.length,
    recovered: recovered.length,
    recoverShare: recover.length === 0 ? null : Math.round((recovered.length / recover.length) * 1000) / 1000,
    missedOver250: missed,
  };
}

/** Mean hands-on minutes. Null until enough walks exist to say what a new person should expect. */
export function newUserMinutes(handsOnMinutes: Array<number | null>) {
  const done = handsOnMinutes.filter((minutes): minutes is number => minutes != null && minutes > 0);
  if (done.length < HOUSE_STUDY.walksBeforeAverage) return null;
  return Math.round((done.reduce((sum, minutes) => sum + minutes, 0) / done.length) * 10) / 10;
}
