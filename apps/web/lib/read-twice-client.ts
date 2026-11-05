import { z } from "zod";
import { identityReadSchema, type IdentityRead } from "./identity-check";

const responseSchema = z.object({ reads: z.array(identityReadSchema.nullable()).length(2).nullable() });

type ReadTwiceAsk = { a: Blob; b: Blob; category: string; said: string; description: string };

/** Two independent reads of one line from two stills. Null when the reads could not run. */
export async function askReadTwice(inventoryId: string, ask: ReadTwiceAsk): Promise<[IdentityRead | null, IdentityRead | null] | null> {
  const body = new FormData();
  body.set("meta", JSON.stringify({ category: ask.category.slice(0, 40), said: ask.said.slice(0, 300), description: ask.description.slice(0, 400) }));
  body.set("a", new File([ask.a], "a.jpg", { type: ask.a.type || "image/jpeg" }));
  body.set("b", new File([ask.b], "b.jpg", { type: ask.b.type || "image/jpeg" }));
  body.set("inventoryId", inventoryId);
  try {
    const response = await fetch("/api/scan/identity", { method: "POST", body });
    if (!response.ok) return null;
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || !parsed.data.reads) return null;
    return [parsed.data.reads[0] ?? null, parsed.data.reads[1] ?? null];
  } catch {
    return null;
  }
}
