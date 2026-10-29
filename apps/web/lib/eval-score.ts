import { z } from "zod";
import type { RoomShard } from "./inventory";

export const truthLineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  count: z.number().int().positive().max(999),
  brand: z.string().trim().max(80).nullable().default(null),
  model: z.string().trim().max(160).nullable().default(null),
  replacementUsd: z.number().finite().nonnegative().max(1_000_000).nullable().default(null),
});

export type TruthLine = z.infer<typeof truthLineSchema>;

type Line = RoomShard["items"][number];

const STOP = new Set(["the", "a", "an", "of", "and", "with", "for", "set", "pair", "piece", "item"]);
const MATCH_AT = 0.3;
const VALUE_TOLERANCE = 0.25;

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOP.has(word))
      .map((word) => (word.length > 3 ? word.replace(/(es|s)$/, "") : word)),
  );
}

function alnum(text: string | null | undefined) {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function similarity(truth: TruthLine, line: Line) {
  const want = tokens([truth.name, ...truth.aliases].join(" "));
  const have = tokens([line.name, line.itemType ?? "", line.category ?? ""].join(" "));
  if (want.size === 0 || have.size === 0) return 0;
  let shared = 0;
  for (const word of want) if (have.has(word)) shared += 1;
  const overlap = shared / Math.min(want.size, have.size);
  const brand = truth.brand && alnum(line.brand) && alnum(line.brand) === alnum(truth.brand) ? 0.25 : 0;
  return overlap + brand;
}

/** Greedy one-to-one match, best pairs first. Truth index to line index. */
export function matchLines(truth: TruthLine[], lines: Line[]) {
  const pairs: { t: number; l: number; score: number }[] = [];
  truth.forEach((want, t) => lines.forEach((line, l) => pairs.push({ t, l, score: similarity(want, line) })));
  pairs.sort((a, b) => b.score - a.score);
  const usedTruth = new Set<number>();
  const usedLine = new Set<number>();
  const matched = new Map<number, number>();
  for (const pair of pairs) {
    if (pair.score < MATCH_AT) break;
    if (usedTruth.has(pair.t) || usedLine.has(pair.l)) continue;
    usedTruth.add(pair.t);
    usedLine.add(pair.l);
    matched.set(pair.t, pair.l);
  }
  return matched;
}

function identityRight(truth: TruthLine, line: Line) {
  if (!truth.brand && !truth.model) return null;
  const brandOk = !truth.brand || alnum(line.brand) === alnum(truth.brand);
  const model = alnum(truth.model);
  const modelOk = !model || alnum(line.markings).includes(model) || alnum(line.name).includes(model);
  return brandOk && modelOk;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ratio(part: number, whole: number) {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 1000;
}

export function scoreRooms(truth: TruthLine[], rooms: RoomShard[]) {
  const lines = rooms.flatMap((room) => room.items);
  const matched = matchLines(truth, lines);
  const rows = truth.map((want, index) => {
    const at = matched.get(index);
    const line = at == null ? null : lines[at];
    const countOk = line ? line.count === want.count : false;
    const identityOk = line ? identityRight(want, line) : null;
    const valueError =
      line && want.replacementUsd && line.priceUsd != null ? Math.abs(line.priceUsd - want.replacementUsd) / want.replacementUsd : null;
    const wrongButSettled = line
      ? (line.countSettled && !countOk) || (line.identitySettled && identityOk === false)
      : false;
    return {
      truth: want.name,
      listedAs: line?.name ?? null,
      count: line ? `${line.count} of ${want.count}` : `0 of ${want.count}`,
      countOk,
      identityOk,
      valueError: valueError == null ? null : Math.round(valueError * 1000) / 1000,
      open: line ? !line.countSettled || !line.identitySettled : null,
      wrongButSettled,
    };
  });

  const found = rows.filter((row) => row.listedAs !== null);
  const withIdentity = found.filter((row) => row.identityOk !== null);
  const withValue = found.filter((row) => row.valueError !== null);
  return {
    truthLines: truth.length,
    listedLines: lines.length,
    found: ratio(found.length, truth.length),
    extraLines: lines.length - found.length,
    countRight: ratio(found.filter((row) => row.countOk).length, truth.length),
    identityRight: ratio(withIdentity.filter((row) => row.identityOk).length, withIdentity.length),
    valueWithin25: ratio(withValue.filter((row) => (row.valueError ?? 1) <= VALUE_TOLERANCE).length, withValue.length),
    medianValueError: median(withValue.map((row) => row.valueError ?? 0)),
    openLines: lines.filter((line) => !line.countSettled || !line.identitySettled).length,
    wrongButSettled: rows.filter((row) => row.wrongButSettled).length,
    rows,
  };
}
