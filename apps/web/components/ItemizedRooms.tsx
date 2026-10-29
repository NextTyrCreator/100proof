"use client";

import { useState } from "react";
import { formatMoney, GROUP_UNDER_USD, userEnteredItem, type HomeInventory, type RoomItem } from "../lib/inventory";
import { keptLineSchema } from "../lib/review-shape";
import { rememberKeptValues } from "../lib/kept-values";

function safeHttp(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

type ItemPatch = {
  userNote?: string;
  userValueUsd?: number | null;
  photoUrl?: string | null;
  priceUsd?: number | null;
  cashValueUsd?: number | null;
  depreciationNote?: string | null;
  valueBasis?: string | null;
  brand?: string | null;
  markings?: string | null;
  sourceUrl?: string | null;
  serial?: string | null;
  ageYears?: number | null;
};

export function ItemizedRooms({
  inventoryId,
  rooms,
  address,
  region,
  onRenameRoom,
  onDeleteItem,
  onUpdateItem,
  onAddItem,
}: {
  inventoryId: string;
  rooms: HomeInventory["rooms"];
  address: string;
  region: string;
  onRenameRoom: (inventoryId: string, roomId: string, title: string) => void;
  onDeleteItem: (inventoryId: string, roomId: string, itemId: string) => void;
  onUpdateItem: (inventoryId: string, roomId: string, itemId: string, patch: ItemPatch) => void;
  onAddItem: (inventoryId: string, item: RoomItem) => void;
}) {
  const [photoError, setPhotoError] = useState("");
  const [checkingId, setCheckingId] = useState("");
  const [addedName, setAddedName] = useState("");
  const [addedCount, setAddedCount] = useState("1");
  const [addedNote, setAddedNote] = useState("");

  function keepPrice(item: RoomItem, amount: number) {
    const line = keptLineSchema.safeParse({
      name: item.name,
      description: [item.itemType, item.brand, item.markings].filter(Boolean).join(" ") || item.detail,
      color: item.color,
      size: item.size,
      replacementUsd: amount,
    });
    if (line.success) rememberKeptValues([line.data]);
  }

  async function checkPicture(roomId: string, item: RoomItem, file: File) {
    if (item.photoUrl?.startsWith("blob:")) URL.revokeObjectURL(item.photoUrl);
    const photoUrl = URL.createObjectURL(file);
    onUpdateItem(inventoryId, roomId, item.id, { photoUrl });
    setCheckingId(item.id);
    setPhotoError("");
    try {
      const body = new FormData();
      body.set("image", file);
      body.set("name", item.name);
      body.set("itemType", item.itemType ?? "");
      body.set("brand", item.brand ?? "");
      body.set("markings", item.markings ?? "");
      body.set("serial", item.serial ?? "");
      body.set("note", item.userNote);
      body.set("ageYears", item.ageYears == null ? "" : String(item.ageYears));
      body.set("address", address);
      body.set("region", region);
      const response = await fetch("/api/scan/review/photo", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as
        | (ItemPatch & { error?: string })
        | null;
      if (!response.ok || !payload || payload.priceUsd == null) {
        setPhotoError(payload?.error || "The picture was saved. The price was not updated.");
        return;
      }
      onUpdateItem(inventoryId, roomId, item.id, {
        priceUsd: payload.priceUsd,
        cashValueUsd: payload.cashValueUsd ?? null,
        depreciationNote: payload.depreciationNote ?? null,
        valueBasis: payload.valueBasis ?? null,
        brand: payload.brand ?? item.brand,
        markings: payload.markings ?? item.markings,
        sourceUrl: payload.sourceUrl ?? null,
        serial: payload.serial ?? item.serial,
        ageYears: payload.ageYears ?? item.ageYears,
      });
    } catch {
      setPhotoError("The picture was saved. The price was not updated.");
    } finally {
      setCheckingId("");
    }
  }

  function addItem() {
    const name = addedName.trim();
    const count = Number(addedCount);
    if (!name || !Number.isInteger(count) || count < 1 || count > 999) return;
    onAddItem(inventoryId, userEnteredItem(name, count, addedNote.trim().slice(0, 500)));
    setAddedName("");
    setAddedCount("1");
    setAddedNote("");
  }

  return (
    <div className="stack">
      {rooms.length === 0 ? (
        <p className="empty-line">Nothing was listed from this walkthrough. Add an item below, or scan again.</p>
      ) : (
        <ul className="rooms">
          {rooms.map((room) => (
            <li key={room.id} className="room">
              <label className="field">
                <span>Room</span>
                <input value={room.title} maxLength={80} onChange={(event) => onRenameRoom(inventoryId, room.id, event.target.value)} />
              </label>
              <ul className="item-list">
                {room.items.map((item) => {
                  const source = safeHttp(item.sourceUrl);
                  const identity = [item.brand, item.markings].filter(Boolean).join(" · ");
                  const traits = [item.category, item.wearer, item.sizeBand === "unknown" ? "size not clear" : item.sizeBand, item.color, item.size, item.age]
                    .filter(Boolean)
                    .join(" · ");
                  const lineTotal = item.priceUsd == null ? null : item.priceUsd * item.count;
                  const cashTotal = item.cashValueUsd == null ? null : item.cashValueUsd * item.count;
                  return (
                    <li key={item.id}>
                      <div className="item-top">
                        <span>
                          {item.name} × {item.count}
                          {item.highValue ? " · High value" : ""}
                          {item.enteredBy === "you" ? " · Entered by you" : ""}
                          {item.grouped ? " · Grouped" : ""}
                        </span>
                        <span>{lineTotal == null ? "No price yet" : formatMoney(lineTotal)}</span>
                      </div>
                      {identity ? <p className="item-meta">{identity}</p> : null}
                      {traits ? <p className="item-meta">{traits}</p> : null}
                      {item.detail ? <p className="item-meta">{item.detail}</p> : null}
                      {item.priceUsd != null ? (
                        <p className="item-meta">
                          Replacement {formatMoney(item.priceUsd)} each
                          {item.count > 1 && lineTotal != null ? ` · ${formatMoney(lineTotal)} together` : ""}
                        </p>
                      ) : null}
                      {item.cashValueUsd != null ? (
                        <p className="item-meta">
                          Cash value {formatMoney(item.cashValueUsd)} each
                          {item.count > 1 && cashTotal != null ? ` · ${formatMoney(cashTotal)} together` : ""}
                        </p>
                      ) : null}
                      {item.depreciationNote ? <p className="item-meta">{item.depreciationNote}</p> : null}
                      {item.narration ? <p className="item-meta">You said: {item.narration}</p> : null}
                      {item.valueBasis ? <p className="item-meta">{item.valueBasis}</p> : null}
                      {source ? (
                        <a className="item-meta" href={source}>
                          Replacement source
                        </a>
                      ) : null}
                      {item.serial ? (
                        <details>
                          <summary>Serial, on this account and the download</summary>
                          <p className="item-meta">{item.serial}</p>
                        </details>
                      ) : null}
                      {item.photoUrl ? (
                        // The picture was added on this device for this item.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="item-photo" src={item.photoUrl} alt="" />
                      ) : null}
                      {checkingId === item.id ? <p className="item-meta">Checking this picture against the local price.</p> : null}
                      <label className="field">
                        <span>Picture</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
                              setPhotoError("Use an image under 8 MB.");
                              return;
                            }
                            void checkPicture(room.id, item, file);
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Description</span>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={item.userNote}
                          placeholder="Add a note about this item"
                          onChange={(event) => onUpdateItem(inventoryId, room.id, item.id, { userNote: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Price paid</span>
                        <input
                          inputMode="decimal"
                          value={item.userValueUsd ?? ""}
                          placeholder="From a receipt, if you have one"
                          onChange={(event) => {
                            const text = event.target.value.trim();
                            if (text === "") {
                              onUpdateItem(inventoryId, room.id, item.id, { userValueUsd: null });
                              return;
                            }
                            const amount = Number(text);
                            if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return;
                            onUpdateItem(inventoryId, room.id, item.id, { userValueUsd: amount });
                            if (amount >= 1) keepPrice(item, amount);
                          }}
                        />
                      </label>
                      <button type="button" className="text-button" onClick={() => onDeleteItem(inventoryId, room.id, item.id)}>
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <form
        className="sheet"
        onSubmit={(event) => {
          event.preventDefault();
          addItem();
        }}
      >
        <p className="hint">Missing something? Add it. The line is marked entered by you. Pieces under ${GROUP_UNDER_USD} from a scan stay grouped by kind.</p>
        <label className="field">
          <span>Item</span>
          <input value={addedName} maxLength={120} onChange={(event) => setAddedName(event.target.value)} />
        </label>
        <label className="field">
          <span>Count</span>
          <input inputMode="numeric" value={addedCount} onChange={(event) => setAddedCount(event.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={2} maxLength={500} value={addedNote} onChange={(event) => setAddedNote(event.target.value)} />
        </label>
        <button type="submit" className="button quiet">
          Add item
        </button>
      </form>
      {photoError ? (
        <p className="form-error" role="alert">
          {photoError}
        </p>
      ) : null}
    </div>
  );
}
