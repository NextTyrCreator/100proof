import { z } from "zod";

/**
 * Research counters for one scan. The camera only counts here; nothing in the app reads these back,
 * shows them, or puts them in an export or the claim file. Metrics, comparisons, and trends are built
 * from them in `apps/web/research/`, which the app never imports.
 */
const count = z.number().int().nonnegative().max(100_000);

export const scanStatsSchema = z.object({
  scanId: z.string().uuid(),
  startedAt: z.string().max(40),
  endedAt: z.string().max(40).nullable(),
  clips: count,
  /** Lines as each clip listed them, before any repeat was merged. */
  listedLines: count,
  mergedLive: count,
  mergedAtDone: count,
  repeatsAsked: count,
  repeatsMergedByOwner: count,
  repeatsKept: count,
  photoChecks: z.object({ same: count, different: count, unsure: count }),
  roomPrompts: z.object({ asked: count, accepted: count, declined: count }),
  belongs: z.object({ asked: count, notHere: count }),
});

export type ScanStats = z.infer<typeof scanStatsSchema>;

export function blankScanStats(scanId: string, startedAt: string): ScanStats {
  return {
    scanId,
    startedAt,
    endedAt: null,
    clips: 0,
    listedLines: 0,
    mergedLive: 0,
    mergedAtDone: 0,
    repeatsAsked: 0,
    repeatsMergedByOwner: 0,
    repeatsKept: 0,
    photoChecks: { same: 0, different: 0, unsure: 0 },
    roomPrompts: { asked: 0, accepted: 0, declined: 0 },
    belongs: { asked: 0, notHere: 0 },
  };
}
