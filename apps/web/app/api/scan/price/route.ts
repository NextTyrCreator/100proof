import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { keptLinesSchema, pricePlace, valueOptionSchema } from "../../../../lib/review-shape";
import { failureCode, priceItems, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const lineSchema = z.object({
  key: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400),
  category: z.string().trim().max(40).nullable(),
  brand: z.string().trim().max(80).nullable(),
  likelyBrand: z.string().trim().max(80).nullable(),
  markings: z.string().trim().max(160).nullable(),
  color: z.string().trim().max(40).nullable(),
  size: z.string().trim().max(40).nullable(),
  options: z.array(valueOptionSchema).max(3),
});

const bodySchema = z.object({
  lines: z.array(lineSchema).min(1).max(30),
  kept: keptLinesSchema,
  address: z.string().max(300),
  region: z.string().max(80),
  inventoryId: uuidSchema.nullable(),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "These lines could not be priced." }, { status: 400 });

  const calls: ModelCall[] = [];
  try {
    const priced = await priceItems(data.user.id, body.data.lines, body.data.kept, pricePlace(body.data.address, body.data.region), calls);
    await recordCalls(supabase, body.data.inventoryId, calls);
    return NextResponse.json({ priced });
  } catch (error) {
    await recordCalls(supabase, body.data.inventoryId, calls);
    const code = failureCode(error);
    console.warn(`[scan] price batch failed: ${code}`);
    const message = error instanceof Error ? error.message : "Prices did not come back.";
    return NextResponse.json({ error: message, code }, { status: code === "limit" ? 429 : 502 });
  }
}
