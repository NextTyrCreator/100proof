import { z } from "zod";

/** The typed contract for one identity read by Muse Spark 1.3. Used by the model call and by saved lines. */
export const identityReadSchema = z.object({
  kind: z.string().trim().min(1).max(60),
  brand: z.string().trim().max(60).nullable(),
  model: z.string().trim().max(80).nullable(),
  evidence: z.string().trim().max(160),
});

export type IdentityRead = z.infer<typeof identityReadSchema>;

/** Two reads of one line and how they compared. Saved on the line. */
export const identityCheckSchema = z.object({
  result: z.enum(["confirmed", "unsure", "single"]),
  reads: z.array(identityReadSchema.nullable()).length(2),
  at: z.string().max(40),
  /** The owner's choice on an unsure line: the first read, the second, or neither. */
  resolved: z.enum(["a", "b", "neither"]).nullable().default(null),
});

export type IdentityCheck = z.infer<typeof identityCheckSchema>;
