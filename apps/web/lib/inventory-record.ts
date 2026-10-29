import { z } from "zod";
import { reviewResultSchema } from "./review-shape";

/** Version 1 of a saved inventory. Media is saved as private storage paths, never as URLs. */

const pathSchema = z
  .string()
  .max(300)
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/);

export const spokenLineSchema = z.object({
  startMs: z.number().finite().nonnegative().max(600_000),
  endMs: z.number().finite().nonnegative().max(600_000),
  text: z.string().trim().min(1).max(300),
});

const savedClipSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string().min(1).max(40),
  durationMs: z.number().finite().nonnegative().max(600_000),
  mediaType: z.string().max(60),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  storagePath: pathSchema.nullable(),
  posterPath: pathSchema.nullable(),
  spoken: z.array(spokenLineSchema).max(60),
});

const enteredItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(400),
  value: z.number().finite().nonnegative().max(1_000_000).nullable(),
  photoUrl: z.null(),
  sourceName: z.string().max(200).nullable(),
  sourceUrl: z.null(),
  confidence: z.literal("entered"),
});

export const savedDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  number: z.number().int().positive().max(100_000),
  addressPoint: z
    .object({
      latitude: z.number().gte(-90).lte(90),
      longitude: z.number().gte(-180).lte(180),
      label: z.string().trim().min(1).max(300),
    })
    .nullable(),
  locationCheck: z.object({ checkedAt: z.string().min(1).max(40), within: z.boolean().nullable() }).nullable(),
  rooms: reviewResultSchema.shape.rooms.max(60),
  clips: z.array(savedClipSchema).max(40),
  items: z.array(enteredItemSchema).max(40),
  coverPath: pathSchema.nullable(),
});

export const itemEventSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  kind: z.enum(["seen", "said", "photo", "clip", "answer", "edit", "priced", "added", "removed"]),
  evidence: z.record(z.string().max(40), z.union([z.string().max(400), z.number().finite(), z.boolean(), z.null()])),
  before: z.record(z.string().max(40), z.union([z.string().max(400), z.number().finite(), z.boolean(), z.null()])).nullable(),
  after: z.record(z.string().max(40), z.union([z.string().max(400), z.number().finite(), z.boolean(), z.null()])).nullable(),
});

export type ItemEvent = z.infer<typeof itemEventSchema>;

export const saveRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(80),
  region: z.enum(["us", "ca", "uk", "eu"]),
  address: z.string().trim().min(1).max(300),
  recordHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  sealedAt: z.string().max(40).nullable(),
  document: savedDocumentSchema,
  events: z.array(itemEventSchema).max(200),
});

export type SaveRequest = z.infer<typeof saveRequestSchema>;

export const listCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export const PAGE_SIZE = 50;
