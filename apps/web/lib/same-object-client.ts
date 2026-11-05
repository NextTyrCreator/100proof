import { z } from "zod";
import { sameObjectCheckSchema, type SameObjectVerdict } from "./repeat-match";

type Side = { name: string; room: string; detail: string; image: Blob };

const responseSchema = z.object({ check: sameObjectCheckSchema.nullable() });

/** A photo for a line: a still kept from this scan, or the line's saved photo. Null when there is none. */
export async function photoBlob(url: string | null | undefined): Promise<Blob | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 && blob.size <= 2 * 1024 * 1024 && blob.type.startsWith("image/") ? blob : null;
  } catch {
    return null;
  }
}

/** Ask Muse Spark 1.3 whether two photos show one object. Null when it could not tell or the call failed. */
export async function askSameObject(inventoryId: string, a: Side, b: Side): Promise<SameObjectVerdict | null> {
  const body = new FormData();
  body.set(
    "meta",
    JSON.stringify({
      a: { name: a.name.slice(0, 120), room: a.room.slice(0, 80), detail: a.detail.slice(0, 400) },
      b: { name: b.name.slice(0, 120), room: b.room.slice(0, 80), detail: b.detail.slice(0, 400) },
    }),
  );
  body.set("a", new File([a.image], "a.jpg", { type: a.image.type || "image/jpeg" }));
  body.set("b", new File([b.image], "b.jpg", { type: b.image.type || "image/jpeg" }));
  body.set("inventoryId", inventoryId);
  try {
    const response = await fetch("/api/scan/same-object", { method: "POST", body });
    if (!response.ok) return null;
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data.check : null;
  } catch {
    return null;
  }
}

/** The line under the buttons. Muse Spark 1.3 advises; the person decides. */
export function verdictText(check: SameObjectVerdict | null | undefined, checking: boolean) {
  if (checking) return "Muse Spark 1.3 is comparing the two photos.";
  if (!check) return "";
  const lead =
    check.verdict === "same"
      ? "Muse Spark 1.3 compared the photos: they look like the same object."
      : check.verdict === "different"
        ? "Muse Spark 1.3 compared the photos: they look like two objects."
        : "Muse Spark 1.3 compared the photos and could not tell.";
  return `${lead}${check.reason ? ` ${check.reason}` : ""}`;
}
