import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCalls, uuidSchema } from "../../../../../lib/account";
import { conditionSchema, damageSchema, pricePlace, valueOptionSchema } from "../../../../../lib/review-shape";
import { reviewEvidence } from "../../../../../lib/review-scan";
import { createServerSupabase } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

const kindSchema = z.enum(["label", "photo", "receipt", "answer"]);

const detailSchema = z.object({
  name: z.string().trim().min(1).max(120),
  itemType: z.string().trim().max(80),
  brand: z.string().trim().max(80),
  markings: z.string().trim().max(160),
  serial: z.string().trim().max(80),
  note: z.string().trim().max(500),
  ageYears: z.number().finite().nonnegative().max(100).nullable(),
  count: z.number().int().positive().max(999),
  priceUsd: z.number().finite().nonnegative().max(1_000_000).nullable(),
  options: z.array(valueOptionSchema).max(3),
  question: z.string().trim().max(160),
  category: z.string().trim().max(40),
  condition: conditionSchema.nullable(),
  damage: damageSchema.nullable(),
  usefulLifeYears: z.number().finite().positive().max(80).nullable(),
});

function json(form: FormData, key: string): unknown {
  try {
    return JSON.parse(text(form, key) || "null");
  } catch {
    return null;
  }
}

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function safeHttp(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().slice(0, 300) : null;
  } catch {
    return null;
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
    return NextResponse.json({ error: "That did not upload." }, { status: 400 });
  }

  const kind = kindSchema.safeParse(text(form, "kind"));
  if (!kind.success) return NextResponse.json({ error: "This item could not be checked." }, { status: 400 });

  let image: { bytes: Buffer; mediaType: string } | null = null;
  const file = form.get("image");
  if (kind.data !== "answer") {
    if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Choose an image." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Use an image under 8 MB." }, { status: 413 });
    image = { bytes: Buffer.from(await file.arrayBuffer()), mediaType: file.type };
  }
  const answer = text(form, "answer").trim().slice(0, 500);
  if (kind.data === "answer" && !answer) return NextResponse.json({ error: "Type an answer." }, { status: 400 });

  let options: unknown = [];
  try {
    options = JSON.parse(text(form, "options") || "[]");
  } catch {
    options = [];
  }
  const ageText = text(form, "ageYears");
  const priceText = text(form, "priceUsd");
  const detail = detailSchema.safeParse({
    name: text(form, "name"),
    itemType: text(form, "itemType"),
    brand: text(form, "brand"),
    markings: text(form, "markings"),
    serial: text(form, "serial"),
    note: text(form, "note"),
    ageYears: ageText ? Number(ageText) : null,
    count: Number(text(form, "count") || "1"),
    priceUsd: priceText ? Number(priceText) : null,
    options,
    question: text(form, "question"),
    category: text(form, "category"),
    condition: json(form, "condition"),
    damage: json(form, "damage"),
    usefulLifeYears: text(form, "usefulLifeYears") ? Number(text(form, "usefulLifeYears")) : null,
  });
  if (!detail.success) return NextResponse.json({ error: "This item could not be checked." }, { status: 400 });

  const place = pricePlace(text(form, "address").slice(0, 300), text(form, "region").slice(0, 80));
  const inventoryText = text(form, "inventoryId");
  const inventoryId = uuidSchema.safeParse(inventoryText).success ? inventoryText : null;

  try {
    const result = await reviewEvidence(
      data.user.id,
      kind.data,
      image,
      answer,
      {
        ...detail.data,
        itemType: detail.data.itemType || null,
        brand: detail.data.brand || null,
        markings: detail.data.markings || null,
        serial: detail.data.serial || null,
        category: detail.data.category || null,
      },
      place,
    );
    await recordCalls(supabase, inventoryId, result.calls);
    const patch = { ...result.patch };
    if (patch.sourceUrl !== undefined) patch.sourceUrl = safeHttp(patch.sourceUrl);
    return NextResponse.json({ patch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The check did not come back.";
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
