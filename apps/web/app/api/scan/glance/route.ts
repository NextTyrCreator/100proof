import { NextResponse } from "next/server";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { glanceFrame, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_BYTES = 300 * 1024;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ seen: [] }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ seen: [] }, { status: 400 });
  }
  const frame = form.get("frame");
  if (!(frame instanceof File) || frame.size === 0 || frame.size > MAX_BYTES || frame.type !== "image/jpeg") {
    return NextResponse.json({ seen: [] }, { status: 400 });
  }
  const inventoryText = form.get("inventoryId");
  const inventoryId = uuidSchema.safeParse(inventoryText).success ? (inventoryText as string) : null;

  const calls: ModelCall[] = [];
  const seen = await glanceFrame(data.user.id, Buffer.from(await frame.arrayBuffer()), frame.type, calls);
  await recordCalls(supabase, inventoryId, calls);
  return NextResponse.json({ seen }, { headers: { "Cache-Control": "private, no-store" } });
}
