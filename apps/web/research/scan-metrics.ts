import { z } from "zod";
import type { HomeInventory, RoomShard } from "../lib/inventory";
import { proofLedger } from "../lib/proof-ledger";
import { readTwiceSummary } from "../lib/read-twice";
import { normLabel } from "../lib/review-shape";
import type { ScanStats } from "../lib/scan-stats";
import { EXPECTED, scoreRun, type RunInputShape } from "../lib/scorecard";

/**
 * RESEARCH ONLY. Scan-to-scan metrics, for internal research and demo preparation. Nothing under
 * `apps/web/app`, `components`, or `lib` may import this folder; the harness fails if anything does.
 * None of it is shown in the app, the camera, the inventory page, an export, or the claim file.
 *
 * The camera counts what happened during one scan (`ScanStats` in `lib/scan-stats.ts`). A scored run
 * combines those counts with the saved lines and the scorer's input into one `ScanMetrics` record, tied to
 * the run number. Records are compared two at a time, and the trend across all of them is the summary
 * presented once the goals are reached. Counts only: no media, no address, no narration.
 */
const count = z.number().int().nonnegative().max(100_000);

const rate = z.number().finite().min(0).max(1).nullable();

export const scanMetricsSchema = z.object({
  run: z.number().int().positive().max(999),
  recordedAt: z.string().max(40),
  build: z.string().max(40),
  scanStartedAt: z.string().max(40).nullable(),
  filmedSeconds: count,
  clips: count,
  lines: count,
  listedLines: count,
  duplicatesMerged: count,
  /** Merged repeats over lines listed: how much doubling the merge removed. */
  duplicateRateBefore: rate,
  /** Duplicate units left over included units, from the scorer. Null until scored. */
  duplicateRateAfter: rate,
  brands: z.object({ found: count, expected: count, rate }),
  readTwice: z.object({ read: count, agreed: count, unsure: count, agreementRate: rate }),
  photoChecks: z.object({ same: count, different: count, unsure: count }),
  belongs: z.object({ asked: count, notHere: count, notHereRate: rate }),
  roomPrompts: z.object({ asked: count, accepted: count, perClip: rate }),
  ledger: z.object({
    totalUsd: z.number().finite().nonnegative(),
    provenUsd: z.number().finite().nonnegative(),
    provenShare: rate,
    receiptShare: rate,
    identifiedShare: rate,
    estimatedShare: rate,
    statedShare: rate,
  }),
  score: z
    .object({
      matchScore: z.number().finite().min(0).max(100),
      captureRate: z.number().finite().min(0).max(100),
      precision: z.number().finite().min(0).max(100).nullable(),
      result: z.string().max(20),
      remindersOn: z.boolean(),
    })
    .nullable(),
});

export type ScanMetrics = z.infer<typeof scanMetricsSchema>;

function share(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}

/** Which of the hand list's brands the saved lines carry. Read or said only; a likely brand does not count. */
function brandHits(rooms: RoomShard[]) {
  const expected = [...new Set(EXPECTED.flatMap((entry) => (entry.brand ? [normLabel(entry.brand)] : [])))];
  const carried = rooms.flatMap((room) => room.items.flatMap((item) => (item.brand && !item.hidden ? [normLabel(item.brand)] : [])));
  const found = expected.filter((brand) => carried.some((seen) => seen === brand || seen.includes(brand) || brand.includes(seen))).length;
  return { found, expected: expected.length, rate: share(found, expected.length) };
}

/**
 * One record for one scored run. `stats` is the scan's own counts; `score` is the scorer's input for the
 * scorecard, or null when the run is recorded before it is scored.
 */
export function buildScanMetrics(input: {
  run: number;
  build: string;
  inventory: Pick<HomeInventory, "rooms" | "clips">;
  stats: ScanStats | null;
  score: RunInputShape | null;
}): ScanMetrics {
  const { inventory, stats } = input;
  const lines = inventory.rooms.reduce((sum, room) => sum + room.items.filter((item) => !item.hidden).length, 0);
  const merged = (stats?.mergedLive ?? 0) + (stats?.mergedAtDone ?? 0) + (stats?.repeatsMergedByOwner ?? 0);
  const listed = stats?.listedLines ?? lines;
  const reads = readTwiceSummary(inventory.rooms);
  const ledger = proofLedger(inventory.rooms);
  const scored = input.score ? scoreRun(input.score) : null;
  const filmedMs = inventory.clips.reduce((sum, clip) => sum + clip.durationMs, 0);
  return {
    run: input.run,
    recordedAt: new Date().toISOString(),
    build: input.build.slice(0, 40),
    scanStartedAt: stats?.startedAt ?? inventory.clips[0]?.startedAt ?? null,
    filmedSeconds: Math.round(filmedMs / 1000),
    clips: stats?.clips ?? inventory.clips.length,
    lines,
    listedLines: listed,
    duplicatesMerged: merged,
    duplicateRateBefore: share(merged, listed),
    duplicateRateAfter: scored?.status === "scored" && input.score ? share(input.score.duplicateUnits, input.score.includedUnits) : null,
    brands: brandHits(inventory.rooms),
    readTwice: { read: reads.read, agreed: reads.agreed, unsure: reads.unsure, agreementRate: share(reads.agreed, reads.read) },
    photoChecks: stats?.photoChecks ?? { same: 0, different: 0, unsure: 0 },
    belongs: { asked: stats?.belongs.asked ?? 0, notHere: stats?.belongs.notHere ?? 0, notHereRate: share(stats?.belongs.notHere ?? 0, stats?.belongs.asked ?? 0) },
    roomPrompts: { asked: stats?.roomPrompts.asked ?? 0, accepted: stats?.roomPrompts.accepted ?? 0, perClip: share(stats?.roomPrompts.asked ?? 0, stats?.clips ?? inventory.clips.length) },
    ledger: {
      totalUsd: Math.round(ledger.total * 100) / 100,
      provenUsd: Math.round(ledger.proven * 100) / 100,
      provenShare: share(ledger.proven, ledger.total),
      receiptShare: share(ledger.bands.receipt.usd, ledger.total),
      identifiedShare: share(ledger.bands.identified.usd, ledger.total),
      estimatedShare: share(ledger.bands.estimated.usd, ledger.total),
      statedShare: share(ledger.bands.stated.usd, ledger.total),
    },
    score:
      scored?.status === "scored" && input.score
        ? { matchScore: scored.matchScore, captureRate: scored.captureRate, precision: scored.precision, result: scored.result, remindersOn: input.score.remindersOn }
        : null,
  };
}

/** The numbers compared between scans, by name. Rates are 0..1; scores are percent. */
const METRICS: { key: string; label: string; read: (record: ScanMetrics) => number | null }[] = [
  { key: "matchScore", label: "Match score (%)", read: (r) => r.score?.matchScore ?? null },
  { key: "captureRate", label: "Capture rate (%)", read: (r) => r.score?.captureRate ?? null },
  { key: "precision", label: "Precision (%)", read: (r) => r.score?.precision ?? null },
  { key: "lines", label: "Lines", read: (r) => r.lines },
  { key: "duplicateRateBefore", label: "Repeats merged / listed", read: (r) => r.duplicateRateBefore },
  { key: "duplicateRateAfter", label: "Duplicates left / included", read: (r) => r.duplicateRateAfter },
  { key: "brandRate", label: "Hand-list brands read", read: (r) => r.brands.rate },
  { key: "readTwiceAgreement", label: "Read-twice agreement", read: (r) => r.readTwice.agreementRate },
  { key: "readTwiceUnsure", label: "Read-twice unsure lines", read: (r) => r.readTwice.unsure },
  { key: "photoSame", label: "Photo check: same", read: (r) => r.photoChecks.same },
  { key: "photoDifferent", label: "Photo check: different", read: (r) => r.photoChecks.different },
  { key: "photoUnsure", label: "Photo check: unsure", read: (r) => r.photoChecks.unsure },
  { key: "belongsAsked", label: "Reminders asked", read: (r) => r.belongs.asked },
  { key: "notHereRate", label: "Reminders answered Not here", read: (r) => r.belongs.notHereRate },
  { key: "roomPromptsPerClip", label: "Room prompts per clip", read: (r) => r.roomPrompts.perClip },
  { key: "provenShare", label: "Proven share of total", read: (r) => r.ledger.provenShare },
  { key: "estimatedShare", label: "Estimated share of total", read: (r) => r.ledger.estimatedShare },
  { key: "statedShare", label: "Stated share of total", read: (r) => r.ledger.statedShare },
  { key: "filmedSeconds", label: "Filmed seconds", read: (r) => r.filmedSeconds },
];

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Two scans side by side, with the change from the first to the second. */
export function compareMetrics(a: ScanMetrics, b: ScanMetrics) {
  return METRICS.map((metric) => {
    const before = metric.read(a);
    const after = metric.read(b);
    return { key: metric.key, label: metric.label, a: before, b: after, delta: before == null || after == null ? null : round3(after - before) };
  });
}

/** Every metric across every recorded scan: the values in run order, the average, and the latest. */
export function trendSummary(records: ScanMetrics[]) {
  const ordered = [...records].sort((x, y) => x.run - y.run);
  return METRICS.map((metric) => {
    const values = ordered.map((record) => metric.read(record));
    const known = values.filter((value): value is number => value != null);
    return {
      key: metric.key,
      label: metric.label,
      values,
      average: known.length > 0 ? round3(known.reduce((sum, value) => sum + value, 0) / known.length) : null,
      latest: known.length > 0 ? (known[known.length - 1] as number) : null,
    };
  });
}

function cell(value: number | null) {
  return value == null ? "—" : String(value);
}

/** The summary view: one row per metric, one column per run, then the average. */
export function trendMarkdown(records: ScanMetrics[]) {
  const ordered = [...records].sort((x, y) => x.run - y.run);
  const runs = ordered.map((record) => `Run ${String(record.run).padStart(2, "0")}`);
  const rows = trendSummary(ordered).map((row) => `| ${row.label} | ${row.values.map(cell).join(" | ")}${row.values.length ? " | " : ""}${cell(row.average)} |`);
  return [
    "# Scan-to-scan metrics",
    "",
    "Generated by `corepack pnpm --filter @100proof/web metrics summary` from `docs/research/scan-metrics.json`. Do not edit by hand.",
    "",
    "Rates are 0 to 1. Scores are percent. A dash means the run was not scored or the measure did not apply. These are research measurements on one hand-listed space, not product claims. The accuracy rate is stated only by the five-run rule in `docs/SCORECARD.md`.",
    "",
    `| Metric | ${runs.join(" | ")}${runs.length ? " | " : ""}Average |`,
    `| --- | ${runs.map(() => "---").join(" | ")}${runs.length ? " | " : ""}--- |`,
    ...rows,
    "",
    ordered.length === 0 ? "No scan has been recorded yet." : `Recorded: ${ordered.map((record) => `Run ${record.run} on ${record.recordedAt.slice(0, 10)} (build ${record.build || "unstated"})`).join("; ")}.`,
    "",
  ].join("\n");
}
