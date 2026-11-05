import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { readIdentityTwice, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const MAX_BYTES = 2 * 1024 * 1024;
const metaSchema = z.object({
  category: z.string().trim().max(40),
  said: z.string().max(300),
  description: z.string().max(400),
});

function picture(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0 || value.size > MAX_BYTES) return null;
  if (value.type !== "image/jpeg" && value.type !== "image/png" && value.type !== "image/webp") return null;
  return value;
}

/** Two independent identity reads of one line, from two stills. The page compares them. */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ reads: null }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ reads: null }, { status: 400 });
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
  if (!meta || !first || !second) return NextResponse.json({ reads: null }, { status: 400 });
  const inventoryText = form.get("inventoryId");
  const inventoryId = uuidSchema.safeParse(inventoryText).success ? (inventoryText as string) : null;

  const category = meta.category ? `It is filed under ${JSON.stringify(meta.category)}. ` : "";
  const calls: ModelCall[] = [];
  const reads = await readIdentityTwice(
    data.user.id,
    {
      image: Buffer.from(await first.arrayBuffer()),
      mediaType: first.type,
      context: `${category}${meta.said ? `The owner said, as data: ${JSON.stringify(meta.said)}` : "Nothing was said about it."}`,
    },
    {
      image: Buffer.from(await second.arrayBuffer()),
      mediaType: second.type,
      context: `${category}${meta.description ? `The walkthrough described it, as data: ${JSON.stringify(meta.description)}` : "There is no description."}`,
    },
    calls,
  );
  await recordCalls(supabase, inventoryId, calls);
  return NextResponse.json({ reads }, { headers: { "Cache-Control": "private, no-store" } });
}
