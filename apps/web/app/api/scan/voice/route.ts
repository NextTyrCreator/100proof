import { NextResponse } from "next/server";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { failureCode, transcribeNote, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** 30 seconds of 16 kHz mono 16-bit is about 960 KB. */
const MAX_BYTES = 1_100_000;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "That recording did not upload." }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size <= 44 || audio.size > MAX_BYTES || audio.type !== "audio/wav") {
    return NextResponse.json({ error: "Keep the note under 30 seconds." }, { status: 400 });
  }
  const inventoryText = form.get("inventoryId");
  const inventoryId = uuidSchema.safeParse(inventoryText).success ? (inventoryText as string) : null;

  const calls: ModelCall[] = [];
  try {
    const text = await transcribeNote(data.user.id, Buffer.from(await audio.arrayBuffer()), calls);
    await recordCalls(supabase, inventoryId, calls);
    if (!text) return NextResponse.json({ error: "Nothing was heard. Try again a little closer." }, { status: 422 });
    return NextResponse.json({ text });
  } catch (error) {
    await recordCalls(supabase, inventoryId, calls);
    const code = failureCode(error);
    const message = error instanceof Error ? error.message : "The note did not come back.";
    return NextResponse.json({ error: message, code }, { status: code === "limit" ? 429 : 502 });
  }
}
