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
    ...document.data.rooms.flatMap((room) => room.items.flatMap((item) => [item.photoPath, ...item.files.map((file) => file.path)])),
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
        items: room.items.map((item) => ({
          ...item,
          photoUrl: item.photoPath ? url(item.photoPath) || null : null,
          files: item.files.map((file) => ({ ...file, url: url(file.path) || null })),
        })),
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

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  try {
    const orgId = await personalOrg(supabase);
    const { data: row, error: readError } = await supabase
      .from("inventories")
      .select("document")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const paths = mediaPaths(row.document, orgId, id);
    const listed = await supabase.storage.from("evidence").list(`${orgId}/${id}`, { limit: 1000 });
    for (const file of listed.data ?? []) paths.add(`${orgId}/${id}/${file.name}`);
    if (paths.size > 0) await supabase.storage.from("evidence").remove([...paths]);

    const { error: eventsError } = await supabase.from("item_events").delete().eq("inventory_id", id).eq("org_id", orgId);
    if (eventsError) throw eventsError;
    const { error: deleteError } = await supabase.from("inventories").delete().eq("id", id).eq("org_id", orgId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "This inventory did not delete." }, { status: 502 });
  }
}

function mediaPaths(document: unknown, orgId: string, inventoryId: string) {
  const paths = new Set<string>();
  const keep = (value: unknown) => {
    if (typeof value !== "string" || !value.startsWith(`${orgId}/${inventoryId}/`)) return;
    paths.add(value);
  };
  if (!document || typeof document !== "object") return paths;
  const doc = document as { clips?: unknown; rooms?: unknown; coverPath?: unknown; items?: unknown };
  keep(doc.coverPath);
  if (Array.isArray(doc.clips)) {
    for (const clip of doc.clips) {
      if (!clip || typeof clip !== "object") continue;
      keep((clip as { storagePath?: unknown }).storagePath);
      keep((clip as { posterPath?: unknown }).posterPath);
    }
  }
  if (Array.isArray(doc.rooms)) {
    for (const room of doc.rooms) {
      if (!room || typeof room !== "object" || !Array.isArray((room as { items?: unknown }).items)) continue;
      for (const item of (room as { items: unknown[] }).items) {
        if (!item || typeof item !== "object") continue;
        keep((item as { photoPath?: unknown }).photoPath);
        const files = (item as { files?: unknown }).files;
        if (!Array.isArray(files)) continue;
        for (const file of files) {
          if (file && typeof file === "object") keep((file as { path?: unknown }).path);
        }
      }
    }
  }
  return paths;
}
