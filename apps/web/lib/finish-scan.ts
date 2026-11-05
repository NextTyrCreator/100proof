import { addressRegionLabel } from "./address-search";
import { sha256Hex, type HomeInventory } from "./inventory";

/**
 * An inventory is finished when it is sealed. Sealing comes after the line pictures are saved, so an
 * unsealed inventory with clips is still finishing, or its finishing step was cut off (the page closed,
 * the phone locked). It is never shown as complete.
 */
export function isUnfinished(inventory: Pick<HomeInventory, "sealedAt" | "clips" | "loaded" | "savedVersion">) {
  if (inventory.sealedAt) return false;
  if (!inventory.loaded) return inventory.savedVersion > 0;
  return inventory.clips.length > 0;
}

/**
 * The record hash from what was saved, for finishing on another visit. It covers the same facts the
 * camera seals: the declaration, when the walk started, how long it ran, and every clip's content hash.
 */
export function sealFromSaved(inventory: HomeInventory, sealedAt: string) {
  return sha256Hex(
    JSON.stringify({
      title: inventory.title.trim(),
      country: addressRegionLabel(inventory.addressRegion),
      address: inventory.homeAddress.trim(),
      locatedAt: inventory.locationCheck?.checkedAt ?? null,
      scanStartedAt: inventory.clips[0]?.startedAt ?? sealedAt,
      durationMs: inventory.clips.reduce((sum, clip) => sum + clip.durationMs, 0),
      pieceHashes: inventory.clips.map((clip) => clip.contentHash),
      sealedAt,
    }),
  );
}

/** Lines still without a picture, with the clip and second to cut one from when no saved still fits. */
export function linesMissingPictures(inventory: HomeInventory) {
  const clips = new Map(inventory.clips.map((clip) => [clip.id, clip]));
  return inventory.rooms.flatMap((room) =>
    room.items.flatMap((item) => {
      if (item.photoPath || item.hidden) return [];
      const sighting = item.sightings.find((entry) => entry.clipId && entry.atSec != null && clips.get(entry.clipId)?.videoUrl);
      const clip = sighting?.clipId ? clips.get(sighting.clipId) : undefined;
      return [{ roomId: room.id, item, clipId: clip?.id ?? null, src: clip?.videoUrl ?? null, atSec: sighting?.atSec ?? null }];
    }),
  );
}

/**
 * A line's still is saved as `<first 8 of the line id>-<random>.jpg` (or the full id for a label snap).
 * When a scan was cut off after the upload and before the save, the file is there and the line does not
 * point at it. This finds it again. Clip posters are named by the clip id and are left out.
 */
export function savedStills(files: { name: string; path: string; url: string | null }[], clipIds: string[]) {
  const posters = new Set(clipIds.map((id) => `${id}.jpg`));
  const byLine = new Map<string, { path: string; url: string | null }>();
  for (const file of files) {
    if (posters.has(file.name) || !/^[0-9a-f]{8}-/i.test(file.name)) continue;
    const key = file.name.slice(0, 8).toLowerCase();
    if (!byLine.has(key)) byLine.set(key, { path: file.path, url: file.url });
  }
  return byLine;
}
