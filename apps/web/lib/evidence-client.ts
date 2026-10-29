import type { RoomItem } from "./inventory";
import type { ItemPatch } from "./inventory-merge";

export type EvidenceSend = "label" | "photo" | "receipt" | "answer";

/** Send one picture or answer for one line to the server check. */
export async function sendEvidence(input: {
  kind: EvidenceSend;
  item: RoomItem;
  image: Blob | null;
  answer: string;
  address: string;
  region: string;
  inventoryId: string;
}): Promise<{ patch: ItemPatch } | { error: string }> {
  const { item } = input;
  const body = new FormData();
  body.set("kind", input.kind);
  if (input.image) body.set("image", new File([input.image], "evidence.jpg", { type: input.image.type || "image/jpeg" }));
  body.set("answer", input.answer);
  body.set("name", item.name);
  body.set("itemType", item.itemType ?? "");
  body.set("brand", item.brand ?? "");
  body.set("markings", item.markings ?? "");
  body.set("serial", item.serial ?? "");
  body.set("note", item.userNote);
  body.set("ageYears", item.ageYears == null ? "" : String(item.ageYears));
  body.set("count", String(item.count));
  body.set("priceUsd", item.priceUsd == null ? "" : String(item.priceUsd));
  body.set("options", JSON.stringify(item.options));
  body.set("question", item.ask?.kind === "question" ? item.ask.prompt : "");
  body.set("address", input.address);
  body.set("region", input.region);
  body.set("inventoryId", input.inventoryId);
  try {
    const response = await fetch("/api/scan/review/evidence", { method: "POST", body });
    const payload = (await response.json().catch(() => null)) as { patch?: ItemPatch; error?: string } | null;
    if (!response.ok || !payload?.patch) return { error: payload?.error || "That did not check. Try again." };
    return { patch: payload.patch };
  } catch {
    return { error: "That did not check. Try again." };
  }
}

export async function dataUrlBlob(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return null;
  try {
    return await (await fetch(dataUrl)).blob();
  } catch {
    return null;
  }
}
