import { NextResponse } from "next/server";
import { z } from "zod";
import { pricePlace } from "../../../../../lib/review-shape";
import { valueFromPhoto } from "../../../../../lib/review-scan";
import { createServerSupabase } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

const detailSchema = z.object({
  name: z.string().trim().min(1).max(120),
  itemType: z.string().trim().max(80),
  brand: z.string().trim().max(80),
  markings: z.string().trim().max(160),
  serial: z.string().trim().max(80),
  note: z.string().trim().max(500),
  ageYears: z.number().finite().nonnegative().max(100).nullable(),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The picture did not upload." }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0 || !image.type.startsWith("image/")) {
    return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: "Use an image under 8 MB." }, { status: 413 });
  }

  const ageText = form.get("ageYears");
  const detail = detailSchema.safeParse({
    name: form.get("name"),
    itemType: typeof form.get("itemType") === "string" ? form.get("itemType") : "",
    brand: typeof form.get("brand") === "string" ? form.get("brand") : "",
    markings: typeof form.get("markings") === "string" ? form.get("markings") : "",
    serial: typeof form.get("serial") === "string" ? form.get("serial") : "",
    note: typeof form.get("note") === "string" ? form.get("note") : "",
    ageYears: typeof ageText === "string" && ageText ? Number(ageText) : null,
  });
  if (!detail.success) return NextResponse.json({ error: "This item could not be checked." }, { status: 400 });

  const address = form.get("address");
  const region = form.get("region");
  const place = pricePlace(
    typeof address === "string" ? address.slice(0, 300) : "",
    typeof region === "string" ? region.slice(0, 80) : "",
  );

  try {
    const bytes = Buffer.from(await image.arrayBuffer());
    const valued = await valueFromPhoto(
      data.user.id,
      bytes,
      image.type,
      {
        name: detail.data.name,
        itemType: detail.data.itemType || null,
        brand: detail.data.brand || null,
        markings: detail.data.markings || null,
        serial: detail.data.serial || null,
        note: detail.data.note,
        ageYears: detail.data.ageYears,
      },
      place,
    );
    return NextResponse.json(valued);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The picture did not return a price.";
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
