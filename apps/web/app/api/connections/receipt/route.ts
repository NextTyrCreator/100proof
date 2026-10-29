import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { failureCode, readConnectedDocument, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const linesSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(80),
      room: z.string().max(80),
      name: z.string().max(120),
      brand: z.string().max(80).nullable(),
      markings: z.string().max(120).nullable(),
      count: z.number().int().positive().max(999),
    }),
  )
  .min(1)
  .max(200);

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "That file did not upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES || !TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, WebP, or PDF under 8 MB." }, { status: 400 });
  }
  const inventoryId = uuidSchema.safeParse(form.get("inventoryId"));
  if (!inventoryId.success) return NextResponse.json({ error: "Open an inventory first." }, { status: 400 });
  let lines: z.infer<typeof linesSchema>;
  try {
    const parsed = linesSchema.safeParse(JSON.parse(String(form.get("lines") ?? "")));
    if (!parsed.success) return NextResponse.json({ error: "This inventory has no lines to match yet." }, { status: 400 });
    lines = parsed.data;
  } catch {
    return NextResponse.json({ error: "This inventory has no lines to match yet." }, { status: 400 });
  }

  const calls: ModelCall[] = [];
  try {
    const document = await readConnectedDocument(
      data.user.id,
      { bytes: Buffer.from(await file.arrayBuffer()), mediaType: file.type, name: file.name.slice(0, 120) },
      lines,
      calls,
    );
    await recordCalls(supabase, inventoryId.data, calls);
    return NextResponse.json({ document }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await recordCalls(supabase, inventoryId.data, calls);
    const code = failureCode(error);
    const message = error instanceof Error ? error.message : "That file did not come back.";
    return NextResponse.json({ error: message, code }, { status: code === "limit" ? 429 : 502 });
  }
}
