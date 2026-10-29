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
import { accuracyMark, receiptVerified } from "../lib/accuracy-mark";
import { keptLineSchema } from "../lib/review-shape";
import { rememberKeptValues } from "../lib/kept-values";
import type { ItemPatch } from "../lib/inventory-merge";
import { ClipFrame } from "./ClipFrame";
import { VoiceNote } from "./VoiceNote";

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
  sameObjectAs: "same object as",
  category: "category",
  condition: "condition",
  damage: "damage",
};

const CONDITION_LABEL: Record<NonNullable<RoomItem["condition"]>, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
  damaged: "Damaged",
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

type Chip = { label: string; tone: "verified" | "yours" | "exact" | "estimate" | "open" | "settled" };

function chipFor(item: RoomItem): Chip {
  if (receiptVerified(item)) return { label: "Receipt verified", tone: "verified" };
  if (item.enteredBy === "you") return { label: "Added by you", tone: "yours" };
  if (!item.countSettled) return { label: "Count open", tone: "open" };
  if (item.priceUsd == null) return { label: "No price yet", tone: "open" };
  if (item.userValueUsd != null) return { label: "Price from you", tone: "yours" };
  if (item.valueBasis?.startsWith("Exact:")) return { label: "Exact product", tone: "exact" };
  if (!item.identitySettled) return { label: item.skipped.includes("label") ? "Estimate accepted" : "Estimated from video", tone: "estimate" };
  return { label: "Settled on camera", tone: "settled" };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
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
  onScanMore,
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
  /** Add up to five more minutes to this inventory. */
  onScanMore?: () => void;
}) {
  const [lineError, setLineError] = useState<{ id: string; text: string } | null>(null);
  const [checkingId, setCheckingId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [addedName, setAddedName] = useState("");
  const [addedCount, setAddedCount] = useState("1");
  const [addedNote, setAddedNote] = useState("");

  const requests = useMemo(() => openRequests(rooms), [rooms]);
  const clipById = useMemo(() => new Map(clips.map((clip, index) => [clip.id, { clip, number: index + 1 }])), [clips]);
  const totals = useMemo(() => {
    const lines = rooms.flatMap((room) => room.items);
    return {
      lines: lines.length,
      replacement: lines.reduce((sum, item) => sum + (item.priceUsd ?? 0) * item.count, 0),
      verified: lines.filter(receiptVerified).length,
    };
  }, [rooms]);

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
      setLineError({ id: item.id, text: "Use an image under 8 MB." });
      return;
    }
    if (kind !== "receipt") {
      if (item.photoUrl?.startsWith("blob:")) URL.revokeObjectURL(item.photoUrl);
      onUpdateItem(inventoryId, roomId, item.id, { photoUrl: URL.createObjectURL(file) });
    }
    setCheckingId(item.id);
    setLineError(null);
    try {
      const [result, path] = await Promise.all([
        sendEvidence({ kind, item, image: file, answer: "", address, region, inventoryId }),
        onSaveMedia(inventoryId, `${item.id}-${kind === "receipt" ? "receipt-" : ""}${crypto.randomUUID().slice(0, 8)}.jpg`, file),
      ]);
      if ("error" in result) {
        if (path && kind !== "receipt") onUpdateItem(inventoryId, roomId, item.id, { photoPath: path });
        setLineError({ id: item.id, text: result.error });
        return;
      }
      const source: ChangeSource = kind === "label" ? "label photo" : kind === "receipt" ? "receipt photo" : "photo";
      const patch = kind === "receipt" ? result.patch : { ...result.patch, photoPath: path };
      onEvidence(inventoryId, roomId, item.id, patch, source, path);
      if (result.patch.priceUsd != null && result.patch.priceUsd >= 1) keepPrice(item, result.patch.priceUsd);
      if (kind === "receipt" && result.patch.userValueUsd == null) {
        setLineError({ id: item.id, text: "This item was not found on that receipt. It is kept as evidence on the line." });
      }
    } finally {
      setCheckingId("");
    }
  }

  async function answerFor(roomId: string, item: RoomItem, text: string, heard: SaidFact["heard"]) {
    const answer = text.trim().slice(0, 500);
    if (!answer) return false;
    setCheckingId(item.id);
    setLineError(null);
    try {
      const result = await sendEvidence({ kind: "answer", item, image: null, answer, address, region, inventoryId });
      const said: SaidFact = { text: answer.slice(0, 300), clipId: null, atSec: null, heard };
      if ("error" in result) {
        onEvidence(inventoryId, roomId, item.id, {}, "your answer", null, said);
        setLineError({ id: item.id, text: result.error });
        return false;
      }
      onEvidence(inventoryId, roomId, item.id, result.patch, "your answer", null, said);
      return true;
    } finally {
      setCheckingId("");
    }
  }

  async function sendAnswer(request: EvidenceRequest) {
    const item = findItem(request.roomId, request.itemId);
    if (!item) return;
    const sent = await answerFor(request.roomId, item, answers[request.key] ?? "", "typed");
    if (sent) setAnswers((current) => ({ ...current, [request.key]: "" }));
  }

  function acceptEstimate(roomId: string, item: RoomItem) {
    onSkip(inventoryId, roomId, item.id, "label");
    if (item.ask?.kind === "question") onSkip(inventoryId, roomId, item.id, "question");
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

  function framesFor(item: RoomItem) {
    const seen = new Set<string>();
    const frames: { src: string; atSec: number; label: string }[] = [];
    for (const sighting of item.sightings) {
      if (!sighting.clipId || sighting.atSec == null) continue;
      const hit = clipById.get(sighting.clipId);
      if (!hit?.clip.videoUrl || seen.has(hit.clip.id)) continue;
      seen.add(hit.clip.id);
      frames.push({ src: hit.clip.videoUrl, atSec: sighting.atSec, label: `Clip ${hit.number} at ${formatClock(sighting.atSec * 1000)}` });
      if (frames.length === 3) break;
    }
    return frames;
  }

  const top = requests.slice(0, SHOWN_AT_ONCE);
  const wider = requests.filter((request) => request.kind === "wider").map((request) => request.itemId);

  return (
    <div className="stack inventory-lines">
      <div className="lines-summary">
        <p className="lines-summary-figures">
          <span>
            <strong>{totals.lines}</strong> {totals.lines === 1 ? "line" : "lines"}
          </span>
          <span>
            <strong>{totals.replacement > 0 ? formatMoney(totals.replacement) : "—"}</strong> to replace
          </span>
          {totals.verified > 0 ? (
            <span className="is-verified">
              <strong>{totals.verified}</strong> receipt verified
            </span>
          ) : null}
        </p>
        <div className="lines-summary-actions">
          {onScanMore ? (
            <button type="button" className="button quiet" onClick={onScanMore}>
              Scan more
            </button>
          ) : null}
          <a className="button quiet" href={`/connections?inventory=${encodeURIComponent(inventoryId)}`}>
            Find receipts
          </a>
        </div>
      </div>

      {top.length > 0 ? (
        <section className="sheet ask-queue" aria-label="Worth a minute">
          <p className="total-label">Worth a minute</p>
          <p className="hint">
            {requests.length === 1
              ? "One line could be firmer. The estimate stands if you leave it."
              : `${requests.length} lines could be firmer. The ones with the most money in doubt are first. Each estimate stands if you leave it.`}
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
                  <div className="ask-actions">
                    {request.kind === "label" || request.kind === "receipt" ? (
                      <label className="button quiet ask-snap">
                        {busy ? "Checking" : request.kind === "label" ? "Add photo" : "Add receipt"}
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
                    <button type="button" className="text-button" onClick={() => onSkip(inventoryId, request.roomId, item.id, request.kind)}>
                      Leave it
                    </button>
                  </div>
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
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {rooms.length === 0 ? (
        <p className="empty-line">Nothing was listed from this walkthrough. Add an item below, or scan again.</p>
      ) : (
        <div className="room-blocks">
          {rooms.map((room) => {
            const roomTotal = room.items.reduce((sum, item) => sum + (item.priceUsd ?? 0) * item.count, 0);
            return (
              <details key={room.id} className="room-fold" open>
                <summary className="room-head">
                  <span className="room-title">{room.title}</span>
                  <span className="room-meta">
                    {room.items.length} {room.items.length === 1 ? "line" : "lines"}
                    {roomTotal > 0 ? ` · ${formatMoney(roomTotal)}` : ""}
                  </span>
                  <span className="fold-mark" aria-hidden="true" />
                </summary>
                {renaming === room.id ? (
                  <form
                    className="room-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setRenaming("");
                    }}
                  >
                    <input
                      value={room.title}
                      maxLength={80}
                      aria-label="Room name"
                      autoFocus
                      onChange={(event) => onRenameRoom(inventoryId, room.id, event.target.value)}
                      onBlur={() => setRenaming("")}
                    />
                  </form>
                ) : (
                  <button type="button" className="text-button room-rename-button" onClick={() => setRenaming(room.id)}>
                    Rename room
                  </button>
                )}
                <ul className="line-list">
                  {room.items.map((item) => {
                    const chip = chipFor(item);
                    const mark = accuracyMark(item);
                    const frames = framesFor(item);
                    const source = safeHttp(item.sourceUrl);
                    const lineTotal = item.priceUsd == null ? null : item.priceUsd * item.count;
                    const cashTotal = item.cashValueUsd == null ? null : item.cashValueUsd * item.count;
                    const identity = [item.brand, item.markings].filter(Boolean).join(" · ");
                    const likely = item.likelyBrand ? `Likely ${item.likelyBrand.name}` : "";
                    const sub = identity || likely || item.itemType || item.category || "";
                    const damageClip = item.damage?.clipId ? clipById.get(item.damage.clipId)?.number : undefined;
                    const damageWhere =
                      damageClip != null ? ` · clip ${damageClip}${item.damage?.atSec != null ? ` at ${formatClock(item.damage.atSec * 1000)}` : ""}` : "";
                    const busy = checkingId === item.id;
                    const firstFrame = frames[0];
                    const verified = receiptVerified(item);
                    return (
                      <li key={item.id}>
                        <details className="line">
                          <summary className="line-row">
                            <span className="line-thumb">
                              {item.photoUrl ? (
                                // The picture was added for this item and is kept with this account.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.photoUrl} alt="" loading="lazy" />
                              ) : firstFrame ? (
                                <ClipFrame src={firstFrame.src} atSec={firstFrame.atSec} className="line-thumb-frame" />
                              ) : (
                                <span className="line-thumb-letters" aria-hidden="true">
                                  {initials(item.name)}
                                </span>
                              )}
                            </span>
                            <span className="line-main">
                              <span className="line-name">
                                {item.name}
                                {item.count > 1 ? <span className="line-count"> × {item.count}</span> : null}
                              </span>
                              <span className="line-sub">
                                <span className={`line-chip is-${chip.tone}`}>{chip.label}</span>
                                {sub ? <span className="line-sub-text">{sub}</span> : null}
                              </span>
                            </span>
                            <span className="line-value">
                              {lineTotal == null ? "—" : formatMoney(lineTotal)}
                              {item.count > 1 && item.priceUsd != null ? <span className="line-each">{formatMoney(item.priceUsd)} each</span> : null}
                            </span>
                          </summary>

                          <div className="line-body">
                            <div className="line-media">
                              {item.photoUrl ? (
                                <figure>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={item.photoUrl} alt="" loading="lazy" />
                                  <figcaption>Your photo</figcaption>
                                </figure>
                              ) : null}
                              {frames.map((frame) => (
                                <figure key={`${frame.src}-${frame.atSec}`}>
                                  <ClipFrame src={frame.src} atSec={frame.atSec} className="line-frame" />
                                  <figcaption>{frame.label}</figcaption>
                                </figure>
                              ))}
                              <label className="line-add-photo">
                                <span>{busy ? "Checking" : "Add photo"}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  disabled={busy}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) void checkPicture(room.id, item, file, item.identitySettled ? "photo" : "label");
                                  }}
                                />
                              </label>
                            </div>

                            <dl className="line-values">
                              <div>
                                <dt>Replacement</dt>
                                <dd>
                                  {item.priceUsd == null ? "Not priced yet" : formatMoney(item.priceUsd)}
                                  {item.count > 1 && lineTotal != null ? <span> · {formatMoney(lineTotal)} for {item.count}</span> : null}
                                </dd>
                              </div>
                              <div>
                                <dt>Cash value</dt>
                                <dd>
                                  {item.cashValueUsd == null ? "—" : formatMoney(item.cashValueUsd)}
                                  {item.count > 1 && cashTotal != null ? <span> · {formatMoney(cashTotal)} for {item.count}</span> : null}
                                </dd>
                              </div>
                              <div className="line-paid">
                                <dt>
                                  <label htmlFor={`paid-${item.id}`}>Price paid</label>
                                </dt>
                                <dd>
                                  <input
                                    id={`paid-${item.id}`}
                                    inputMode="decimal"
                                    value={item.userValueUsd ?? ""}
                                    placeholder="If you know it"
                                    onChange={(event) => {
                                      const text = event.target.value.trim().replace(/[$,]/g, "");
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
                                  <span className={verified ? "paid-source is-verified" : "paid-source"}>
                                    {verified ? "Receipt verified" : item.userValueUsd != null ? "From you · not verified yet" : "Add a receipt to verify it"}
                                  </span>
                                </dd>
                              </div>
                              {item.condition || item.damage ? (
                                <div className="line-condition">
                                  <dt>Condition</dt>
                                  <dd>
                                    {CONDITION_LABEL[item.condition ?? "damaged"]}
                                    {item.damage ? (
                                      <span>
                                        {" "}
                                        · {item.damage.note}, {item.damage.severity}
                                        {damageWhere}
                                      </span>
                                    ) : null}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>

                            {item.depreciationNote && item.cashValueUsd !== item.priceUsd ? <p className="line-note">{item.depreciationNote}</p> : null}

                            {!item.identitySettled && item.enteredBy === "scan" ? (
                              <div className="line-estimate">
                                <p>
                                  {item.skipped.includes("label")
                                    ? "You accepted this estimate from the video."
                                    : "Estimated from the video. The model number is not needed to price it."}
                                  {item.likelyBrand ? ` Likely ${item.likelyBrand.name}, not confirmed: ${item.likelyBrand.clues}.` : ""}
                                  {item.options.length > 0
                                    ? ` Could be ${item.options.map((option) => `${option.label} (${formatMoney(option.lowUsd)}–${formatMoney(option.highUsd)})`).join("; ")}.`
                                    : ""}
                                </p>
                                {!item.skipped.includes("label") ? (
                                  <button type="button" className="button quiet line-action" onClick={() => acceptEstimate(room.id, item)}>
                                    Use this estimate
                                  </button>
                                ) : null}
                              </div>
                            ) : null}

                            <label className="field line-description">
                              <span>Description</span>
                              <textarea
                                rows={2}
                                maxLength={500}
                                value={item.userNote}
                                placeholder="Anything a reviewer should know"
                                onChange={(event) => onUpdateItem(inventoryId, room.id, item.id, { userNote: event.target.value })}
                              />
                            </label>

                            <div className="line-actions">
                              <label className="button quiet line-action">
                                {busy ? "Checking" : verified ? "Add another receipt" : "Add receipt"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={busy}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) void checkPicture(room.id, item, file, "receipt");
                                  }}
                                />
                              </label>
                              <VoiceNote
                                inventoryId={inventoryId}
                                disabled={busy}
                                onText={(text) => void answerFor(room.id, item, text, "transcript")}
                              />
                              {confirmDelete === item.id ? (
                                <span className="line-confirm">
                                  <button type="button" className="text-button is-danger" onClick={() => onDeleteItem(inventoryId, room.id, item.id)}>
                                    Delete line
                                  </button>
                                  <button type="button" className="text-button" onClick={() => setConfirmDelete("")}>
                                    Keep
                                  </button>
                                </span>
                              ) : (
                                <button type="button" className="text-button" onClick={() => setConfirmDelete(item.id)}>
                                  Delete
                                </button>
                              )}
                            </div>
                            {busy ? <p className="hint">Checking this against local prices.</p> : null}
                            {lineError?.id === item.id ? <p className="form-error line-error">{lineError.text}</p> : null}

                            <details className="evidence">
                              <summary>
                                Evidence · {mark.label} · {mark.met} of {mark.total} signals
                              </summary>
                              <dl>
                                {mark.next ? (
                                  <>
                                    <dt>What would firm it up</dt>
                                    <dd>{mark.next}</dd>
                                  </>
                                ) : null}
                                {mark.signals.some((signal) => !signal.met) ? (
                                  <>
                                    <dt>Not on this line yet</dt>
                                    <dd>{mark.signals.filter((signal) => !signal.met).map((signal) => signal.label.toLowerCase()).join(", ")}</dd>
                                  </>
                                ) : null}
                                {frames.length > 0 ? (
                                  <>
                                    <dt>The camera</dt>
                                    <dd>{frames.map((frame) => frame.label.toLowerCase()).join(", ")}</dd>
                                  </>
                                ) : null}
                                {item.said.map((fact, index) => (
                                  <div key={`${fact.text}-${index}`}>
                                    <dt>{heardLabel(fact)}</dt>
                                    <dd>“{fact.text}”</dd>
                                  </div>
                                ))}
                                {item.valueBasis ? (
                                  <>
                                    <dt>
                                      {item.valueBasis.startsWith("Exact:") ? "Exact product" : item.valueBasis.startsWith("Comparable:") ? "Comparable" : "Replacement"}
                                    </dt>
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
                                {item.serial ? (
                                  <>
                                    <dt>Serial</dt>
                                    <dd>{item.serial}</dd>
                                  </>
                                ) : null}
                                {item.detail ? (
                                  <>
                                    <dt>From the scan</dt>
                                    <dd>{item.detail}</dd>
                                  </>
                                ) : null}
                                {item.changes.map((entry) => (
                                  <div key={entry.id}>
                                    <dt>
                                      Changed by {entry.source === "check" ? "the end-of-scan check" : entry.source} · {formatWhen(entry.at)}
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
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <details className="sheet add-line">
        <summary>Add something the scan missed</summary>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            addItem();
          }}
        >
          <p className="hint">The line is marked added by you. Pieces under ${GROUP_UNDER_USD} from a scan stay grouped by kind.</p>
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
      </details>
    </div>
  );
}
