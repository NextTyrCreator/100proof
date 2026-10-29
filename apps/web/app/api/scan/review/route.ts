import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../lib/account";
import { failureCode, reviewWalkthrough, type ModelCall } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 40 * 1024 * 1024;
/** 30 seconds of 16 kHz mono is about 1 MB. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const focusSchema = z.array(z.string().trim().min(1).max(120)).max(10);
const knownSchema = z.object({
  rooms: z.array(z.string().trim().min(1).max(80)).max(20),
  lines: z.array(z.string().trim().min(1).max(200)).max(80),
});

function countPiece(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  if (number < 0 || number > 20) return fallback;
  return number;
}

function readJson<T>(value: FormDataEntryValue | null, schema: z.ZodType<T>, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The walkthrough did not upload." }, { status: 400 });
  }

  const video = form.get("video");
  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json({ error: "The walkthrough recording is missing." }, { status: 400 });
  }
  if (video.size > MAX_BYTES) {
    return NextResponse.json({ error: "This walkthrough is too large to review." }, { status: 413 });
  }
  const part = Math.max(1, countPiece(form.get("part"), 1));
  const stated = countPiece(form.get("parts"), 0);
  const parts = stated === 0 ? 0 : Math.max(part, stated);

  const narration = form.get("audio");
  const audio =
    narration instanceof File && narration.size > 44 && narration.size <= MAX_AUDIO_BYTES && narration.type === "audio/wav"
      ? Buffer.from(await narration.arrayBuffer())
      : null;

  const focus = readJson(form.get("focus"), focusSchema, []);
  const known = readJson(form.get("known"), knownSchema, { rooms: [], lines: [] });
  const inventoryText = form.get("inventoryId");
  const inventoryId = uuidSchema.safeParse(inventoryText).success ? (inventoryText as string) : null;

  const calls: ModelCall[] = [];
  const started = Date.now();
  try {
    const bytes = Buffer.from(await video.arrayBuffer());
    const result = await reviewWalkthrough(data.user.id, bytes, video.type || "", { part, parts }, { audio, focus, known }, calls);
    await recordCalls(supabase, inventoryId, calls);
    return NextResponse.json({ review: result.review, spoken: result.spoken, salvaged: result.salvaged });
  } catch (error) {
    await recordCalls(supabase, inventoryId, calls);
    const code = failureCode(error);
    console.warn(`[scan] clip ${part} failed: ${code} after ${Date.now() - started} ms`);
    const message = error instanceof Error ? error.message : "The review did not finish.";
    if (message.includes("not configured")) return NextResponse.json({ error: message }, { status: 503 });
    return NextResponse.json({ error: message, code, retry: code !== "limit" }, { status: code === "limit" ? 429 : 502 });
  }
}
