"use client";

import { useMemo, useState } from "react";
import { sendEvidence, type EvidenceSend } from "../lib/evidence-client";
import { openRequests, SHOWN_AT_ONCE, type EvidenceRequest } from "../lib/evidence-requests";
import {
  formatClock,
  formatMoney,
  formatWhen,
  GROUP_UNDER_USD,
  userEnteredItem,
  type ChangeSource,
  type EvidenceKind,
  type HomeInventory,
  type RoomItem,
  type SaidFact,
} from "../lib/inventory";
import { keptLineSchema } from "../lib/review-shape";
import { rememberKeptValues } from "../lib/kept-values";
import type { ItemPatch } from "../lib/inventory-merge";

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

const FIELD_LABELS: Record<string, string> = {
  count: "count",
  countSettled: "count settled",
  identitySettled: "model settled",
  brand: "brand",
  markings: "model or mark",
  serial: "serial",
  priceUsd: "replacement",
  cashValueUsd: "cash value",
  userValueUsd: "price paid",
  ageYears: "age",
  valueBasis: "basis",
};

function shown(key: string, value: string | number | boolean | null) {
  if (value === null) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (key === "serial") return "recorded";
  if (typeof value === "number" && (key === "priceUsd" || key === "cashValueUsd" || key === "userValueUsd")) return formatMoney(value);
  return String(value);
}

function heardLabel(fact: SaidFact) {
  if (fact.heard === "typed") return "You answered";
  if (fact.heard === "transcript") return "You said (transcribed)";
  return "You said (heard by the video model)";
}

export function ItemizedRooms({
  inventoryId,
  rooms,
  clips = [],
  address,
  region,
  onRenameRoom,
  onDeleteItem,
  onUpdateItem,
  onAddItem,
  onEvidence,
  onSkip,
  onSaveMedia,
  onFilmFocus,
}: {
  inventoryId: string;
  rooms: HomeInventory["rooms"];
  clips?: HomeInventory["clips"];
  address: string;
  region: string;
  onRenameRoom: (inventoryId: string, roomId: string, title: string) => void;
  onDeleteItem: (inventoryId: string, roomId: string, itemId: string) => void;
  onUpdateItem: (inventoryId: string, roomId: string, itemId: string, patch: ItemPatch) => void;
  onAddItem: (inventoryId: string, item: RoomItem) => void;
  onEvidence: (
    inventoryId: string,
    roomId: string,
    itemId: string,
    patch: ItemPatch,
    source: ChangeSource,
    evidenceRef: string | null,
    said?: SaidFact,
  ) => void;
  onSkip: (inventoryId: string, roomId: string, itemId: string, kind: EvidenceKind) => void;
  onSaveMedia: (inventoryId: string, name: string, blob: Blob) => Promise<string | null>;
  /** Film another clip to settle these lines. Absent while the first scan is still on screen. */
  onFilmFocus?: (itemIds: string[]) => void;
}) {
  const [photoError, setPhotoError] = useState("");
  const [checkingId, setCheckingId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [addedName, setAddedName] = useState("");
  const [addedCount, setAddedCount] = useState("1");
  const [addedNote, setAddedNote] = useState("");

  const requests = useMemo(() => openRequests(rooms), [rooms]);
  const clipNumber = useMemo(() => new Map(clips.map((clip, index) => [clip.id, index + 1])), [clips]);

  function findItem(roomId: string, itemId: string) {
    return rooms.find((room) => room.id === roomId)?.items.find((item) => item.id === itemId) ?? null;
  }

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

  async function checkPicture(roomId: string, item: RoomItem, file: File, kind: Exclude<EvidenceSend, "answer">) {
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      setPhotoError("Use an image under 8 MB.");
      return;
    }
    if (item.photoUrl?.startsWith("blob:")) URL.revokeObjectURL(item.photoUrl);
    const photoUrl = URL.createObjectURL(file);
    onUpdateItem(inventoryId, roomId, item.id, { photoUrl });
    setCheckingId(item.id);
    setPhotoError("");
    try {
      const [result, photoPath] = await Promise.all([
        sendEvidence({ kind, item, image: file, answer: "", address, region, inventoryId }),
        onSaveMedia(inventoryId, `${item.id}-${crypto.randomUUID().slice(0, 8)}.jpg`, file),
      ]);
      if ("error" in result) {
        if (photoPath) onUpdateItem(inventoryId, roomId, item.id, { photoPath });
        setPhotoError(result.error);
        return;
      }
      const source: ChangeSource = kind === "label" ? "label photo" : kind === "receipt" ? "receipt photo" : "photo";
      onEvidence(inventoryId, roomId, item.id, { ...result.patch, photoPath }, source, photoPath);
      if (result.patch.priceUsd != null && result.patch.priceUsd >= 1) keepPrice(item, result.patch.priceUsd);
    } finally {
      setCheckingId("");
    }
  }

  async function sendAnswer(request: EvidenceRequest) {
    const item = findItem(request.roomId, request.itemId);
    const answer = (answers[request.key] ?? "").trim().slice(0, 500);
    if (!item || !answer) return;
    setCheckingId(item.id);
    setPhotoError("");
    try {
      const result = await sendEvidence({ kind: "answer", item, image: null, answer, address, region, inventoryId });
      const said: SaidFact = { text: answer.slice(0, 300), clipId: null, atSec: null, heard: "typed" };
      if ("error" in result) {
        onEvidence(inventoryId, request.roomId, item.id, {}, "your answer", null, said);
        setPhotoError(result.error);
        return;
      }
      onEvidence(inventoryId, request.roomId, item.id, result.patch, "your answer", null, said);
      setAnswers((current) => ({ ...current, [request.key]: "" }));
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

  const top = requests.slice(0, SHOWN_AT_ONCE);
  const wider = requests.filter((request) => request.kind === "wider").map((request) => request.itemId);

  return (
    <div className="stack">
      {top.length > 0 ? (
        <section className="sheet ask-queue" aria-label="Still open">
          <p className="total-label">Still open</p>
          <p className="hint">
            {requests.length === 1
              ? "One line is not settled. Settle it now, or leave it for the person who reviews the file."
              : `${requests.length} lines are not settled. The ones with the most money in doubt are first.`}
          </p>
          <ul className="ask-list">
            {top.map((request) => {
              const item = findItem(request.roomId, request.itemId);
              if (!item) return null;
              const busy = checkingId === item.id;
              return (
                <li key={request.key} className="ask-item">
                  <p className="ask-prompt">{request.prompt}</p>
                  <p className="ask-why">
                    {request.why} · {request.roomTitle}
                  </p>
                  {request.kind === "label" || request.kind === "receipt" ? (
                    <label className="button quiet ask-snap">
                      {busy ? "Checking" : request.kind === "label" ? "Snap the label" : "Snap the receipt"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void checkPicture(request.roomId, item, file, request.kind === "label" ? "label" : "receipt");
                        }}
                      />
                    </label>
                  ) : null}
                  {request.kind === "wider" && onFilmFocus ? (
                    <button type="button" className="button quiet" onClick={() => onFilmFocus(wider.length > 0 ? wider : [item.id])}>
                      Film it
                    </button>
                  ) : null}
                  {request.kind === "question" ? (
                    <form
                      className="ask-answer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendAnswer(request);
                      }}
                    >
                      <input
                        value={answers[request.key] ?? ""}
                        maxLength={500}
                        placeholder="Your answer"
                        onChange={(event) => setAnswers((current) => ({ ...current, [request.key]: event.target.value }))}
                      />
                      <button type="submit" className="button quiet" disabled={busy}>
                        {busy ? "Checking" : "Send"}
                      </button>
                    </form>
                  ) : null}
                  <button type="button" className="text-button" onClick={() => onSkip(inventoryId, request.roomId, item.id, request.kind)}>
                    Leave it
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
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
                  const seen = item.sightings.filter((sighting) => sighting.clipId);
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
                      {!item.countSettled || !item.identitySettled ? (
                        <p className="item-open">
                          {[!item.countSettled ? "Count not settled" : "", !item.identitySettled ? "Model not settled" : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
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
                      <details className="evidence">
                        <summary>Evidence</summary>
                        <dl>
                          {seen.length > 0 ? (
                            <>
                              <dt>The camera</dt>
                              <dd>
                                {seen
                                  .slice(0, 6)
                                  .map((sighting) => {
                                    const clip = sighting.clipId ? clipNumber.get(sighting.clipId) : undefined;
                                    const at = sighting.atSec == null ? "" : ` at ${formatClock(sighting.atSec * 1000)}`;
                                    return clip ? `clip ${clip}${at}` : `a clip${at}`;
                                  })
                                  .join(", ")}
                              </dd>
                            </>
                          ) : null}
                          {item.said.map((fact, index) => (
                            <div key={`${fact.text}-${index}`}>
                              <dt>{heardLabel(fact)}</dt>
                              <dd>“{fact.text}”</dd>
                            </div>
                          ))}
                          {item.userValueUsd != null ? (
                            <>
                              <dt>Price paid</dt>
                              <dd>{formatMoney(item.userValueUsd)}, kept apart from the replacement estimate</dd>
                            </>
                          ) : null}
                          {item.valueBasis ? (
                            <>
                              <dt>{item.valueBasis.startsWith("Exact:") ? "Exact product" : item.valueBasis.startsWith("Comparable:") ? "Comparable" : "Replacement"}</dt>
                              <dd>
                                {item.valueBasis}
                                {item.pricedAt ? ` · priced ${formatWhen(item.pricedAt)}` : ""}
                                {source ? (
                                  <>
                                    {" · "}
                                    <a href={source} rel="noreferrer noopener" target="_blank">
                                      source
                                    </a>
                                  </>
                                ) : null}
                              </dd>
                            </>
                          ) : null}
                          {item.options.length > 0 ? (
                            <>
                              <dt>Could be</dt>
                              <dd>
                                {item.options
                                  .map((option) => `${option.label} (${formatMoney(option.lowUsd)}–${formatMoney(option.highUsd)})`)
                                  .join("; ")}
                              </dd>
                            </>
                          ) : null}
                          {item.changes.map((entry) => (
                            <div key={entry.id}>
                              <dt>
                                Changed by {entry.source} · {formatWhen(entry.at)}
                              </dt>
                              <dd>
                                {Object.keys(entry.after)
                                  .map((key) => `${FIELD_LABELS[key] ?? key}: ${shown(key, entry.before[key] ?? null)} → ${shown(key, entry.after[key] ?? null)}`)
                                  .join("; ")}
                              </dd>
                            </div>
                          ))}
                          {item.enteredBy === "you" ? (
                            <>
                              <dt>Entered by you</dt>
                              <dd>Not from the scan.</dd>
                            </>
                          ) : null}
                        </dl>
                      </details>
                      {item.serial ? (
                        <details>
                          <summary>Serial, on this account and the download</summary>
                          <p className="item-meta">{item.serial}</p>
                        </details>
                      ) : null}
                      {item.photoUrl ? (
                        // The picture was added for this item and is kept with this account.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="item-photo" src={item.photoUrl} alt="" loading="lazy" />
                      ) : null}
                      {checkingId === item.id ? <p className="item-meta">Checking this against the local price.</p> : null}
                      <label className="field">
                        <span>Picture</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void checkPicture(room.id, item, file, item.identitySettled ? "photo" : "label");
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
