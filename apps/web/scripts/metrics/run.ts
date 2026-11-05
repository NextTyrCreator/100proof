/**
 * RESEARCH ONLY. Scan-to-scan metrics, outside the app.
 *
 *   corepack pnpm --filter @100proof/web metrics add --run 1 --doc <document.json> [--score <run-input.json>] [--build <sha>]
 *   corepack pnpm --filter @100proof/web metrics compare 1 2
 *   corepack pnpm --filter @100proof/web metrics summary
 *
 * `--doc` is one saved inventory document as JSON (the `document` column of `inventories`, exported by the
 * scorer). `--score` is the scorer's input for `scoreRun`, including the Reminders checkbox. Records go to
 * `docs/research/scan-metrics.json`; the trend goes to `docs/research/SCAN_METRICS_TREND.md` and the latest
 * run's demo cards to `docs/research/DEMO_COMPARE.md`. Counts only: no media, address, or narration.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { reviewResultSchema } from "../../lib/review-shape";
import { scanStatsSchema } from "../../lib/scan-stats";
import { runInputSchema } from "../../lib/scorecard";
import { demoCards, demoCompareMarkdown } from "../../research/demo-compare";
import { buildScanMetrics, compareMetrics, scanMetricsSchema, trendMarkdown, type ScanMetrics } from "../../research/scan-metrics";

const ROOT = join(process.cwd(), "..", "..");
const STORE = join(ROOT, "docs", "research", "scan-metrics.json");
const TREND = join(ROOT, "docs", "research", "SCAN_METRICS_TREND.md");
const CARDS = join(ROOT, "docs", "research", "DEMO_COMPARE.md");

const storeSchema = z.object({ runs: z.array(scanMetricsSchema) });
const documentSchema = z.object({
  rooms: reviewResultSchema.shape.rooms,
  clips: z.array(z.object({ startedAt: z.string(), durationMs: z.number() }).passthrough()),
  scanStats: z.array(scanStatsSchema).optional(),
});

function flag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? (process.argv[index + 1] ?? null) : null;
}

async function readStore() {
  try {
    return storeSchema.parse(JSON.parse(await readFile(STORE, "utf8"))).runs;
  } catch {
    return [] as ScanMetrics[];
  }
}

async function writeOut(runs: ScanMetrics[]) {
  await mkdir(dirname(STORE), { recursive: true });
  await writeFile(STORE, `${JSON.stringify({ runs: [...runs].sort((a, b) => a.run - b.run) }, null, 2)}\n`);
  await writeFile(TREND, trendMarkdown(runs));
}

async function add() {
  const run = Number(flag("run"));
  const docPath = flag("doc");
  if (!Number.isInteger(run) || run < 1 || !docPath) throw new Error("add needs --run <n> and --doc <document.json>");
  const raw = JSON.parse(await readFile(docPath, "utf8")) as unknown;
  const document = documentSchema.parse((raw as { document?: unknown }).document ?? raw);
  const scorePath = flag("score");
  const score = scorePath ? runInputSchema.parse(JSON.parse(await readFile(scorePath, "utf8"))) : null;
  const stats = document.scanStats?.at(-1) ?? null;
  const inventory = { rooms: document.rooms, clips: document.clips as never };
  const record = buildScanMetrics({ run, build: flag("build") ?? "", inventory, stats, score });
  const runs = [...(await readStore()).filter((entry) => entry.run !== run), record];
  await writeOut(runs);
  await writeFile(CARDS, demoCompareMarkdown(demoCards(document.rooms, stats), run));
  console.log(`Run ${run} recorded. ${record.lines} lines, match ${record.score?.matchScore ?? "not scored"}.`);
}

async function compare() {
  const [, , , a, b] = process.argv;
  const runs = await readStore();
  const first = runs.find((entry) => entry.run === Number(a));
  const second = runs.find((entry) => entry.run === Number(b));
  if (!first || !second) throw new Error("compare needs two recorded run numbers");
  console.log(`| Metric | Run ${first.run} | Run ${second.run} | Change |\n| --- | --- | --- | --- |`);
  for (const row of compareMetrics(first, second)) console.log(`| ${row.label} | ${row.a ?? "—"} | ${row.b ?? "—"} | ${row.delta ?? "—"} |`);
}

async function summary() {
  const runs = await readStore();
  await writeOut(runs);
  console.log(trendMarkdown(runs));
}

const command = process.argv[2];
const run = command === "add" ? add : command === "compare" ? compare : command === "summary" ? summary : null;
if (!run) {
  console.log("Use: metrics add --run <n> --doc <file> [--score <file>] [--build <sha>] | metrics compare <a> <b> | metrics summary");
  process.exitCode = 1;
} else {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
