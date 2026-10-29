import { z } from "zod";
import { ADDRESS_REGION_IDS } from "./address-search";
import { locationCheckedAt, locationWithin, type HomeInventory } from "./inventory";
import { savedDocumentSchema, type ItemEvent, type SaveRequest } from "./inventory-record";
import { reviewResultSchema } from "./review-shape";

/** Ready to save once it has a title, a country, an address, and one reviewed clip. */
export function savable(inventory: HomeInventory) {
  return (
    inventory.loaded &&
    inventory.title.trim().length > 0 &&
    (ADDRESS_REGION_IDS as readonly string[]).includes(inventory.addressRegion) &&
    inventory.homeAddress.trim().length > 0 &&
    inventory.clips.length > 0
  );
}

export function toSaveRequest(inventory: HomeInventory, events: ItemEvent[]): SaveRequest | null {
  const within = locationWithin(inventory);
  const checkedAt = locationCheckedAt(inventory);
  const document = savedDocumentSchema.safeParse({
    schemaVersion: 1,
    number: inventory.number,
    addressPoint: inventory.addressPoint,
    locationCheck: checkedAt ? { checkedAt, within } : null,
    rooms: inventory.rooms.map((room) => ({
      ...room,
      items: room.items.map((item) => ({ ...item, photoUrl: null })),
    })),
    clips: inventory.clips.map((clip) => ({
      id: clip.id,
      startedAt: clip.startedAt,
      durationMs: clip.durationMs,
      mediaType: clip.mediaType.slice(0, 60),
      contentHash: clip.contentHash,
      storagePath: clip.storagePath,
      posterPath: clip.posterPath,
      spoken: clip.spoken,
    })),
    items: inventory.items.map((item) => ({ ...item, photoUrl: null, sourceUrl: null })),
    coverPath: inventory.clips.find((clip) => clip.posterPath)?.posterPath ?? null,
  });
  if (!document.success) return null;
  return {
    version: Math.max(0, inventory.savedVersion),
    title: inventory.title.trim(),
    region: inventory.addressRegion as SaveRequest["region"],
    address: inventory.homeAddress.trim(),
    recordHash: inventory.recordHash,
    sealedAt: inventory.sealedAt,
    document: document.data,
    events,
  };
}

const listEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(80),
  createdAt: z.string(),
  sealedAt: z.string().nullable(),
  number: z.number().int().positive(),
  coverUrl: z.string().max(2_000),
});

export const listResponseSchema = z.object({
  orgId: z.string().uuid(),
  inventories: z.array(listEntrySchema),
  next: z.object({ before: z.string(), beforeId: z.string().uuid() }).nullable(),
});

export function fromListEntry(entry: z.infer<typeof listEntrySchema>): HomeInventory {
  return {
    id: entry.id,
    number: entry.number,
    title: entry.title,
    homeAddress: "",
    addressRegion: "",
    addressPoint: null,
    place: null,
    locationCheck: null,
    recordHash: null,
    sealedAt: entry.sealedAt,
    rooms: [],
    clips: [],
    items: [],
    savedVersion: -1,
    loaded: false,
    createdAt: entry.createdAt,
    coverUrl: entry.coverUrl,
  };
}

const loadedSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  region: z.enum(ADDRESS_REGION_IDS),
  address: z.string(),
  version: z.number().int().positive(),
  recordHash: z.string().nullable(),
  sealedAt: z.string().nullable(),
  createdAt: z.string(),
  document: savedDocumentSchema.extend({
    clips: z.array(
      savedDocumentSchema.shape.clips.element.extend({ videoUrl: z.string().max(2_000), posterUrl: z.string().max(2_000) }),
    ),
    rooms: reviewResultSchema.shape.rooms,
  }),
});

export function fromLoaded(payload: unknown): HomeInventory | null {
  const parsed = loadedSchema.safeParse(payload);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    id: data.id,
    number: data.document.number,
    title: data.title,
    homeAddress: data.address,
    addressRegion: data.region,
    addressPoint: data.document.addressPoint,
    place: null,
    locationCheck: data.document.locationCheck,
    recordHash: data.recordHash,
    sealedAt: data.sealedAt,
    rooms: data.document.rooms,
    clips: data.document.clips.map((clip) => ({ ...clip, sourceKept: true as const })),
    items: data.document.items,
    savedVersion: data.version,
    loaded: true,
    createdAt: data.createdAt,
    coverUrl: data.document.clips.find((clip) => clip.posterUrl)?.posterUrl ?? "",
  };
}
