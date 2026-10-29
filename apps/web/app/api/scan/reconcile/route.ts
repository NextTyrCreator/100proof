import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { failureCode, reconcileLines, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().uuid(),
        room: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(120),
        kind: z.string().trim().max(80),
        category: z.string().trim().max(40),
        brand: z.string().trim().max(80).nullable(),
        clips: z.array(z.number().int().positive().max(40)).max(20),
        said: z.string().trim().max(160).nullable(),
      }),
    )
    .max(300),
  inventoryId: uuidSchema.nullable(),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "The list could not be checked." }, { status: 400 });

  const calls: ModelCall[] = [];
  try {
    const answer = await reconcileLines(data.user.id, body.data.lines, calls);
    await recordCalls(supabase, body.data.inventoryId, calls);
    return NextResponse.json(answer);
  } catch (error) {
    await recordCalls(supabase, body.data.inventoryId, calls);
    console.warn(`[scan] reconcile failed: ${failureCode(error)}`);
    return NextResponse.json({ same: [], rooms: [], fix: [] });
  }
}
