import { NextResponse } from "next/server";
import { personalOrg, uuidSchema } from "../../../../lib/account";
import { saveRequestSchema, savedDocumentSchema } from "../../../../lib/inventory-record";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_SECONDS = 60 * 60;
const MAX_BODY = 2_500_000;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { data, error } = await supabase
    .from("inventories")
    .select("id, title, region, address, document, version, record_hash, sealed_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "This inventory did not load." }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const document = savedDocumentSchema.safeParse(data.document);
  if (!document.success) return NextResponse.json({ error: "This inventory did not load." }, { status: 502 });

  const paths = [
    ...document.data.clips.flatMap((clip) => [clip.storagePath, clip.posterPath]),
    ...document.data.rooms.flatMap((room) => room.items.map((item) => item.photoPath)),
  ].filter((path): path is string => Boolean(path));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from("evidence").createSignedUrls([...new Set(paths)], SIGNED_SECONDS);
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }
  const url = (path: string | null) => (path ? (signed.get(path) ?? "") : "");

  return NextResponse.json({
    id: data.id,
    title: data.title,
    region: data.region,
    address: data.address,
    version: data.version,
    recordHash: data.record_hash,
    sealedAt: data.sealed_at,
    createdAt: data.created_at,
    document: {
      ...document.data,
      clips: document.data.clips.map((clip) => ({ ...clip, videoUrl: url(clip.storagePath), posterUrl: url(clip.posterPath) })),
      rooms: document.data.rooms.map((room) => ({
        ...room,
        items: room.items.map((item) => ({ ...item, photoUrl: item.photoPath ? url(item.photoPath) || null : null })),
      })),
    },
  });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "This inventory is too large to save." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "This inventory did not save." }, { status: 400 });
  }
  const parsed = saveRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "This inventory did not save." }, { status: 400 });
  const save = parsed.data;
  const document = {
    ...save.document,
    rooms: save.document.rooms.map((room) => ({
      ...room,
      items: room.items.map((item) => ({ ...item, photoUrl: null })),
    })),
  };

  try {
    const orgId = await personalOrg(supabase);
    let version: number;
    if (save.version === 0) {
      const { error } = await supabase.from("inventories").insert({
        id,
        org_id: orgId,
        created_by: auth.user.id,
        title: save.title,
        region: save.region,
        address: save.address,
        document,
        record_hash: save.recordHash,
        sealed_at: save.sealedAt,
      });
      if (error) {
        return NextResponse.json({ error: "This inventory changed somewhere else. Reload it." }, { status: 409 });
      }
      version = 1;
    } else {
      const { data, error } = await supabase
        .from("inventories")
        .update({
          title: save.title,
          region: save.region,
          address: save.address,
          document,
          record_hash: save.recordHash,
          sealed_at: save.sealedAt,
          version: save.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("org_id", orgId)
        .eq("version", save.version)
        .select("version")
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "This inventory changed somewhere else. Reload it." }, { status: 409 });
      version = data.version as number;
    }

    let eventsSaved = true;
    if (save.events.length > 0) {
      const { error } = await supabase.from("item_events").upsert(
        save.events.map((event) => ({
          id: event.id,
          org_id: orgId,
          inventory_id: id,
          item_id: event.itemId,
          kind: event.kind,
          evidence: event.evidence,
          before: event.before,
          after: event.after,
          created_by: auth.user.id,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      eventsSaved = !error;
    }
    return NextResponse.json({ version, orgId, eventsSaved });
  } catch {
    return NextResponse.json({ error: "This inventory did not save." }, { status: 502 });
  }
}
