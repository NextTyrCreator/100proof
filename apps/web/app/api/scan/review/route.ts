import { NextResponse } from "next/server";
import { keptLinesSchema, pricePlace } from "../../../../lib/review-shape";
import { reviewWalkthrough } from "../../../../lib/review-scan";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;

function countPiece(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  if (number < 0 || number > 20) return fallback;
  return number;
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

  let kept: ReturnType<typeof keptLinesSchema.parse> = [];
  const keptText = form.get("kept");
  if (typeof keptText === "string" && keptText) {
    try {
      const parsed = keptLinesSchema.safeParse(JSON.parse(keptText));
      if (parsed.success) kept = parsed.data;
    } catch {
      kept = [];
    }
  }

  try {
    const address = form.get("address");
    const region = form.get("region");
    const place = pricePlace(
      typeof address === "string" ? address.slice(0, 300) : "",
      typeof region === "string" ? region.slice(0, 80) : "",
    );
    const bytes = Buffer.from(await video.arrayBuffer());
    const review = await reviewWalkthrough(data.user.id, bytes, video.type || "", kept, place, { part, parts });
    return NextResponse.json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The review did not finish.";
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
