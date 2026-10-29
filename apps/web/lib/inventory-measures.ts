import { openRequests } from "./evidence-requests";
import type { ChangeSource, HomeInventory } from "./inventory";

const EVIDENCE_SOURCES: ChangeSource[] = ["label photo", "receipt photo", "photo", "clip", "your answer"];

/**
 * What one inventory shows about the work it took, read from the record itself.
 * Time to file runs from the first clip to the last change; it includes waiting, so it is an upper bound.
 */
export function documentMeasures(inventory: HomeInventory) {
  const lines = inventory.rooms.flatMap((room) => room.items);
  const open = openRequests(inventory.rooms);
  const openLines = new Set(open.map((request) => request.itemId)).size;
  const settled = lines.filter((item) => item.countSettled && item.identitySettled).length;
  const changes = lines.flatMap((item) => item.changes);

  const changesBy = Object.fromEntries(
    [...EVIDENCE_SOURCES, "your edit" as const].map((source) => [source, changes.filter((entry) => entry.source === source).length]),
  ) as Record<ChangeSource, number>;
  const linesChangedByEvidence = lines.filter((item) =>
    item.changes.some((entry) => EVIDENCE_SOURCES.includes(entry.source)),
  ).length;

  const starts = inventory.clips.map((clip) => Date.parse(clip.startedAt)).filter(Number.isFinite);
  const ends = [
    ...inventory.clips.map((clip) => Date.parse(clip.startedAt) + clip.durationMs),
    ...changes.map((entry) => Date.parse(entry.at)),
  ].filter(Number.isFinite);
  const firstAt = starts.length > 0 ? Math.min(...starts) : null;
  const lastAt = ends.length > 0 ? Math.max(...ends) : null;

  return {
    clips: inventory.clips.length,
    filmedSeconds: Math.round(inventory.clips.reduce((sum, clip) => sum + clip.durationMs, 0) / 1000),
    rooms: inventory.rooms.length,
    lines: lines.length,
    linesSettled: settled,
    settledShare: lines.length > 0 ? Math.round((settled / lines.length) * 100) / 100 : null,
    linesStillOpen: openLines,
    requestsStillOpen: open.length,
    dollarsInDoubt: Math.round(open.reduce((sum, request) => sum + request.inDoubtUsd, 0)),
    requestsLeftForReviewer: lines.reduce((sum, item) => sum + item.skipped.length, 0),
    linesChangedByEvidence,
    changesBy,
    firstClipAt: firstAt == null ? null : new Date(firstAt).toISOString(),
    lastChangeAt: lastAt == null ? null : new Date(lastAt).toISOString(),
    minutesToFile: firstAt == null || lastAt == null ? null : Math.round(((lastAt - firstAt) / 60_000) * 10) / 10,
  };
}
