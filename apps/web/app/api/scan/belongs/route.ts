import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { suggestForgotten, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  room: z.string().trim().min(1).max(80),
  lines: z.array(z.string().trim().min(1).max(120)).max(80),
  inventoryId: uuidSchema.nullable().optional(),
});

/** What-belongs-here prompts for one room: up to three questions, from the room name and its lines only. */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ questions: [] }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ questions: [] }, { status: 400 });
  const calls: ModelCall[] = [];
  const questions = await suggestForgotten(data.user.id, parsed.data.room, parsed.data.lines, calls);
  await recordCalls(supabase, parsed.data.inventoryId ?? null, calls);
  return NextResponse.json({ questions }, { headers: { "Cache-Control": "private, no-store" } });
}
