import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { checkSameObject, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

const MAX_BYTES = 2 * 1024 * 1024;
const sideSchema = z.object({
  name: z.string().trim().min(1).max(120),
  room: z.string().trim().min(1).max(80),
  detail: z.string().max(400),
});
const metaSchema = z.object({ a: sideSchema, b: sideSchema });

function picture(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0 || value.size > MAX_BYTES) return null;
  if (value.type !== "image/jpeg" && value.type !== "image/png" && value.type !== "image/webp") return null;
  return value;
}

/** Two photos of a possible repeat, judged by Muse Spark 1.3. The answer is advice for the person. */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ check: null }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ check: null }, { status: 400 });
  }
  const metaText = form.get("meta");
  let meta: z.infer<typeof metaSchema> | null = null;
  try {
    const parsed = metaSchema.safeParse(typeof metaText === "string" ? JSON.parse(metaText) : null);
    meta = parsed.success ? parsed.data : null;
  } catch {
    meta = null;
  }
  const first = picture(form.get("a"));
  const second = picture(form.get("b"));
  if (!meta || !first || !second) return NextResponse.json({ check: null }, { status: 400 });
  const inventoryText = form.get("inventoryId");
  const inventoryId = uuidSchema.safeParse(inventoryText).success ? (inventoryText as string) : null;

  const calls: ModelCall[] = [];
  const check = await checkSameObject(
    data.user.id,
    { ...meta.a, image: Buffer.from(await first.arrayBuffer()), mediaType: first.type },
    { ...meta.b, image: Buffer.from(await second.arrayBuffer()), mediaType: second.type },
    calls,
  );
  await recordCalls(supabase, inventoryId, calls);
  return NextResponse.json({ check }, { headers: { "Cache-Control": "private, no-store" } });
}
