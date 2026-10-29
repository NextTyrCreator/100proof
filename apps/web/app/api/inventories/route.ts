import { NextResponse } from "next/server";
import { personalOrg } from "../../../lib/account";
import { listCursorSchema, PAGE_SIZE } from "../../../lib/inventory-record";
import { createServerSupabase } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_SECONDS = 60 * 60;

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const url = new URL(request.url);
  const cursor = listCursorSchema.safeParse({
    createdAt: url.searchParams.get("before") ?? undefined,
    id: url.searchParams.get("beforeId") ?? undefined,
  });

  try {
    const orgId = await personalOrg(supabase);
    let query = supabase
      .from("inventories")
      .select("id, title, created_at, sealed_at, cover:document->>coverPath, number:document->number")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (cursor.success) {
      query = query.or(
        `created_at.lt."${cursor.data.createdAt}",and(created_at.eq."${cursor.data.createdAt}",id.lt.${cursor.data.id})`,
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; title: string; created_at: string; sealed_at: string | null; cover: string | null; number: number | null }>;
    const page = rows.slice(0, PAGE_SIZE);
    const covers = page.map((row) => row.cover).filter((path): path is string => Boolean(path));
    const signed = new Map<string, string>();
    if (covers.length > 0) {
      const { data: urls } = await supabase.storage.from("evidence").createSignedUrls(covers, SIGNED_SECONDS);
      for (const entry of urls ?? []) {
        if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
      }
    }
    const last = page.at(-1);
    return NextResponse.json({
      orgId,
      inventories: page.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        sealedAt: row.sealed_at,
        number: typeof row.number === "number" ? row.number : 1,
        coverUrl: row.cover ? (signed.get(row.cover) ?? "") : "",
      })),
      next: rows.length > PAGE_SIZE && last ? { before: last.created_at, beforeId: last.id } : null,
    });
  } catch {
    return NextResponse.json({ error: "Your inventories did not load." }, { status: 502 });
  }
}
