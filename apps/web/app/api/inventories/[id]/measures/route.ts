import { NextResponse } from "next/server";
import { z } from "zod";
import { uuidSchema } from "../../../../../lib/account";
import { summarizeCalls } from "../../../../../lib/call-measures";
import { createServerSupabase } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One inventory is reviewed in at most a few hundred calls; this caps a runaway. */
const MAX_ROWS = 2000;

const rowSchema = z.object({
  call: z.enum(["list", "price", "photo", "narration", "reconcile", "glance", "receipt", "voice"]),
  ok: z.boolean(),
  latency_ms: z.number().nonnegative(),
  bytes_in: z.number().nonnegative(),
  audio_ms: z.number().nonnegative().nullable(),
  created_at: z.string(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { data, error } = await supabase
    .from("cost_ledger")
    .select("call, ok, latency_ms, bytes_in, audio_ms, created_at")
    .eq("inventory_id", id)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) return NextResponse.json({ error: "The measures did not load." }, { status: 502 });

  const rows = z.array(rowSchema).safeParse(data ?? []);
  if (!rows.success) return NextResponse.json({ error: "The measures did not load." }, { status: 502 });

  return NextResponse.json(
    summarizeCalls(
      rows.data.map((row) => ({
        call: row.call,
        ok: row.ok,
        latencyMs: row.latency_ms,
        bytesIn: row.bytes_in,
        audioMs: row.audio_ms,
        at: row.created_at,
      })),
    ),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
