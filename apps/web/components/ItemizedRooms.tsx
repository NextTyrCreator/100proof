"use client";

import { useMemo, useState, Fragment } from "react";
import { sendEvidence, type EvidenceSend } from "../lib/evidence-client";
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
import { accuracyMark } from "../lib/accuracy-mark";
import { APPRAISAL_BASIS, appraisalDocumented, confidenceTone, lineConfidence, nextEvidence, receiptVerified } from "../lib/line-confidence";
import { chipText, rowSubtitle, shortName } from "../lib/line-row";
import { readOneLine, readsDisagree } from "../lib/read-twice";
import { walkLabel, type WalkCompare } from "../lib/walk-compare";
import { isDecor, keptLineSchema, revalue } from "../lib/review-shape";
import { rememberKeptValues } from "../lib/kept-values";
import type { ItemPatch } from "../lib/inventory-merge";
import { ClipFrame } from "./ClipFrame";
import { LineReplay } from "./LineReplay";
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
  if (fact.heard === "typed") return "Answered on this line";
  if (fact.heard === "transcript") return "Stated on the walkthrough";
  return "Heard on the walkthrough";
}

function lineStory(item: RoomItem) {
  const maker = item.brand
    ? `The walkthrough supports ${item.brand}${item.markings ? `, ${item.markings}` : ""}, from the picture or from what was stated while this item was shown.`
    : item.likelyBrand
      ? `The picture points to a likely brand, ${item.likelyBrand.name}, and that brand is not confirmed. ${item.likelyBrand.clues}.`
      : "No brand was identified. The picture did not show a maker, and none was stated for this item.";
  const priced = item.valueBasis?.startsWith("Exact:")
    ? `Replacement cost is the exact product. ${item.valueBasis.slice("Exact:".length).trim()}`
    : item.valueBasis?.startsWith("Comparable:")
      ? `Replacement cost is a comparable, because the exact product was not confirmed. ${item.valueBasis.slice("Comparable:".length).trim()}`
      : item.priceUsd != null
        ? "Replacement cost is an estimate for this kind of item. No brand was applied."
        : "Replacement cost is not set yet.";
  const cash =
    item.priceUsd != null && item.cashValueUsd == null
      ? " Actual cash value is not set until the age is known."
      : item.cashValueUsd != null && item.priceUsd != null && item.cashValueUsd !== item.priceUsd
        ? " Actual cash value is lower, for age and condition."
        : "";
  const next = receiptVerified(item)
    ? " A receipt is already on this line."
    : " If you have the receipt or anything more, add it here or connect the account. That is how this line can be verified another way.";
  return `${maker} ${priced}${cash}${next}`;
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
  onSaveMedia,
  onResolveIdentity,
  walk = null,
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
  onSaveMedia: (inventoryId: string, name: string, blob: Blob) => Promise<string | null>;
  /** The owner's pick when the two identity reads disagree. */
  onResolveIdentity?: (itemId: string, pick: "a" | "b" | "neither") => void;
  /** The last Scan more walk compared with these lines. */
  walk?: WalkCompare | null;
}) {
  const [lineError, setLineError] = useState<{ id: string; text: string } | null>(null);
  const [checkingId, setCheckingId] = useState("");
  const [renaming, setRenaming] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [lineFilter, setLineFilter] = useState<"all" | "attention" | "hidden">("all");
  const [addedName, setAddedName] = useState("");
  const [addedCount, setAddedCount] = useState("1");
  const [addedNote, setAddedNote] = useState("");

  const clipById = useMemo(() => new Map(clips.map((clip, index) => [clip.id, { clip, number: index + 1 }])), [clips]);
  const totals = useMemo(() => {
    const lines = rooms.flatMap((room) => room.items).filter((item) => !item.hidden);
    return {
      hidden: rooms.reduce((sum, room) => sum + room.items.filter((item) => item.hidden).length, 0),
      attention: lines.filter((item) => {
        const confidence = lineConfidence(item);
        return !confidence.assessed && (confidence.needsReceipt || nextEvidence(item, confidence) != null);
      }).length,
    };
  }, [rooms]);

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

  function addItem() {
    const name = addedName.trim();
    const count = Number(addedCount);
    if (!name || !Number.isInteger(count) || count < 1 || count > 999) return;
    onAddItem(inventoryId, userEnteredItem(name, count, addedNote.trim().slice(0, 500)));
    setAddedName("");
    setAddedCount("1");
    setAddedNote("");
  }

  function needsAttention(item: RoomItem) {
    if (item.hidden) return null;
    const confidence = lineConfidence(item);
    if (confidence.assessed) return null;
    if (confidence.caps.includes("statedConflict")) return nextEvidence(item, confidence);
    if (confidence.needsReceipt) return "Add the receipt. It confirms the model, the price paid, and the description.";
    return nextEvidence(item, confidence);
  }

  /** The appraisal counts at 99% only with its document on the line. Until then the amount is a stated price. */
  function setAppraisal(roomId: string, item: RoomItem, amount: number | null) {
    const documented = amount != null && appraisalDocumented({ ...item, appraisalUsd: amount });
    if (!documented) {
      onUpdateItem(inventoryId, roomId, item.id, { appraisalUsd: amount });
      return;
    }
    const worn = revalue({ ...item, priceUsd: amount });
    onUpdateItem(inventoryId, roomId, item.id, {
      appraisalUsd: amount,
      priceUsd: amount,
      valueBasis: APPRAISAL_BASIS,
      cashValueUsd: worn?.cash ?? null,
      depreciationNote: worn?.note ?? null,
    });
  }

  /** The year bought sets the age, and the age sets the cash value. Cleared, the cash value is unknown again. */
  function setYearBought(roomId: string, item: RoomItem, text: string) {
    const trimmed = text.trim();
    const thisYear = new Date().getFullYear();
    const year = Number(trimmed);
    if (trimmed !== "" && (!/^\d{4}$/.test(trimmed) || year < 1900 || year > thisYear)) return;
    const ageYears = trimmed === "" ? null : thisYear - year;
    const worn = revalue({ ...item, ageYears });
    onUpdateItem(inventoryId, roomId, item.id, { ageYears, cashValueUsd: worn?.cash ?? null, depreciationNote: worn?.note ?? null });
  }

  async function attachFile(roomId: string, item: RoomItem, file: File, asAppraisal = false) {
    const pdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const image = file.type.startsWith("image/");
    if ((!pdf && !image) || file.size > 8 * 1024 * 1024) {
      setLineError({ id: item.id, text: "Use a picture or a PDF under 8 MB." });
      return;
    }
    if (item.files.length >= 8) {
      setLineError({ id: item.id, text: "This item already has 8 files." });
      return;
    }
    const ext = pdf ? "pdf" : file.type.includes("png") ? "png" : "jpg";
    const stored = `${item.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const path = await onSaveMedia(inventoryId, stored, file);
    if (!path) {
      setLineError({ id: item.id, text: "That file did not save. Try it again." });
      return;
    }
    setLineError(null);
    const attached = { id: crypto.randomUUID(), name: file.name.slice(0, 120) || stored, path, mediaType: file.type || (pdf ? "application/pdf" : "image/jpeg"), url: URL.createObjectURL(file) };
    const files = [...item.files, attached];
    if (!asAppraisal) {
      onUpdateItem(inventoryId, roomId, item.id, { files });
      return;
    }
    const amount = item.appraisalUsd != null && item.appraisalUsd > 0 ? item.appraisalUsd : null;
    const worn = amount == null ? null : revalue({ ...item, priceUsd: amount });
    onUpdateItem(inventoryId, roomId, item.id, {
      files,
      appraisalFileId: attached.id,
      ...(amount == null
        ? {}
        : { priceUsd: amount, valueBasis: APPRAISAL_BASIS, cashValueUsd: worn?.cash ?? null, depreciationNote: worn?.note ?? null }),
    });
  }

  function framesFor(item: RoomItem) {
    const seen = new Set<string>();
    const frames: { src: string; atSec: number; label: string }[] = [];
    for (const sighting of item.sightings) {
      if (!sighting.clipId || sighting.atSec == null) continue;
      const hit = clipById.get(sighting.clipId);
      if (!hit?.clip.videoUrl || seen.has(hit.clip.id)) continue;
      if (sighting.atSec === 0 && hit.clip.durationMs > 3000) continue;
      seen.add(hit.clip.id);
      frames.push({ src: hit.clip.videoUrl, atSec: sighting.atSec, label: `Clip ${hit.number} at ${formatClock(sighting.atSec * 1000)}` });
      if (frames.length === 3) break;
    }
    return frames;
  }

  /** The seconds to replay: where the line was seen, or, for a line from the owner's words, where it was said. */
  function replayFor(item: RoomItem) {
    const seen = item.sightings.find((sighting) => sighting.clipId && sighting.atSec != null && clipById.get(sighting.clipId)?.clip.videoUrl);
    const said = item.said.find((fact) => fact.clipId && fact.atSec != null && clipById.get(fact.clipId)?.clip.videoUrl);
    const stated = /^stated, not seen/i.test(item.detail.trim());
    const pick = stated ? (said ?? seen) : (seen ?? said);
    if (!pick?.clipId || pick.atSec == null) return null;
    const hit = clipById.get(pick.clipId);
    if (!hit?.clip.videoUrl) return null;
    return {
      src: hit.clip.videoUrl,
      atSec: pick.atSec,
      durationMs: hit.clip.durationMs,
      spoken: hit.clip.spoken,
      label: `clip ${hit.number} at ${formatClock(pick.atSec * 1000)}${stated ? ", where it was said" : ""}`,
    };
  }

  return (
    <div className="stack inventory-lines">
      {rooms.some((room) => room.items.length > 0) ? (
        <div className="line-toolbar">
          <div className="line-filter" role="group" aria-label="Which lines to show">
            <button type="button" aria-pressed={lineFilter === "all"} onClick={() => setLineFilter("all")}>
              All
            </button>
            <button type="button" aria-pressed={lineFilter === "attention"} onClick={() => setLineFilter("attention")}>
              Needs a receipt{totals.attention > 0 ? ` · ${totals.attention}` : ""}
            </button>
            {totals.hidden > 0 ? (
              <button type="button" aria-pressed={lineFilter === "hidden"} onClick={() => setLineFilter("hidden")}>
                Hidden · {totals.hidden}
              </button>
            ) : null}
          </div>
          <a className="text-button" href={`/connections?inventory=${encodeURIComponent(inventoryId)}`}>
            Find receipts
          </a>
        </div>
      ) : null}

      {rooms.length === 0 ? (
        <p className="empty-line">Nothing was listed from this walkthrough. Add an item below, or scan again.</p>
      ) : (
        <div className="room-blocks">
          {rooms.map((room) => {
            const active = room.items.filter((item) => !item.hidden);
            const hiddenCount = room.items.length - active.length;
            const rows = room.items
              .filter((item) => {
                if (lineFilter === "hidden") return item.hidden;
                if (lineFilter === "attention") return needsAttention(item) != null;
                return true;
              })
              .slice()
              .sort((a, b) => Number(a.hidden) - Number(b.hidden));
            if (rows.length === 0) return null;
            return (
              <details key={room.id} className="room-fold" open>
                <summary className="room-head">
                  <span className="room-title">{room.title}</span>
                  <span className="room-meta">
                    {active.length} {active.length === 1 ? "item" : "items"}
                    {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
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
                  {[...rows.filter((item) => !isDecor(item)), ...rows.filter((item) => isDecor(item))].map((item, index, ordered) => {
                    const decorHeading = isDecor(item) && (index === 0 || !isDecor(ordered[index - 1]!));
                    const mark = accuracyMark(item);
                    const frames = framesFor(item);
                    const source = safeHttp(item.sourceUrl);
                    const lineTotal = item.priceUsd == null ? null : item.priceUsd * item.count;
                    const cashTotal = item.cashValueUsd == null ? null : item.cashValueUsd * item.count;
                    const sub = rowSubtitle(item);
                    const walkEntry = walk?.entries.find((candidate) => candidate.ids.includes(item.id));
                    const damageClip = item.damage?.clipId ? clipById.get(item.damage.clipId)?.number : undefined;
                    const damageWhere =
                      damageClip != null ? ` · clip ${damageClip}${item.damage?.atSec != null ? ` at ${formatClock(item.damage.atSec * 1000)}` : ""}` : "";
                    const busy = checkingId === item.id;
                    const firstFrame = frames[0];
                    const verified = receiptVerified(item);
                    const confidence = lineConfidence(item);
                    const attention = needsAttention(item);
                    return (
                      <Fragment key={item.id}>
                        {decorHeading ? <li className="decor-label">Decor</li> : null}
                      <li>
                        <details className={item.hidden ? "line is-hidden" : "line"}>
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
                              <span className="line-name" title={item.name}>
                                {shortName(item.name)}
                                {item.count > 1 ? <span className="line-count"> ×{item.count}</span> : null}
                              </span>
                              <span className="line-sub">
                                <span
                                  className={`line-chip is-${confidenceTone(confidence)}`}
                                  title={confidence.percent == null ? confidence.label : `${confidence.percent}% · ${confidence.label}`}
                                >
                                  {chipText(confidence)}
                                </span>
                                {sub ? <span className="line-sub-text">{sub}</span> : null}
                              </span>
                            </span>
                            <span className="line-value">
                              {item.hidden ? "Hidden" : lineTotal == null ? "—" : formatMoney(lineTotal)}
                              {!item.hidden && item.count > 1 && item.priceUsd != null ? <span className="line-each">{formatMoney(item.priceUsd)} each</span> : null}
                            </span>
                            <span className="line-tools">
                              <button
                                type="button"
                                className={item.hidden ? "line-hide is-restore" : "line-hide"}
                                aria-label={item.hidden ? `Show ${item.name}` : `Hide ${item.name} from the report`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  onUpdateItem(inventoryId, room.id, item.id, { hidden: !item.hidden });
                                }}
                              >
                                {item.hidden ? "+" : "−"}
                              </button>
                            </span>
                          </summary>

                          <div className="line-body">
                            <p className="line-fullname">
                              {item.name}
                              {item.count > 1 ? ` × ${item.count}` : ""}
                            </p>
                            {walkEntry && walkEntry.status !== "seen" ? (
                              <p className="line-next">{walkLabel(walkEntry, walk?.since ?? null)}</p>
                            ) : null}
                            <dl className="line-stats">
                              <div className="line-stat is-confidence">
                                <dt>Confidence</dt>
                                <dd>
                                  <span className={`line-chip is-${confidenceTone(confidence)}`}>
                                    {confidence.percent == null ? confidence.label : `${confidence.percent}% · ${confidence.label}`}
                                  </span>
                                  <span className="line-stat-note">
                                    {confidence.tier === "stated"
                                      ? "Stated, not seen on camera"
                                      : confidence.assessed
                                        ? `Counted · ${confidence.bar}% is the bar at this price`
                                        : `Counts at ${confidence.bar}%`}
                                  </span>
                                </dd>
                              </div>
                              <div className="line-stat">
                                <dt>Replacement cost</dt>
                                <dd>
                                  {item.priceUsd == null ? "Not priced yet" : formatMoney(item.priceUsd)}
                                  {item.count > 1 && lineTotal != null ? <span className="line-stat-note">{formatMoney(lineTotal)} for {item.count}</span> : null}
                                </dd>
                              </div>
                              <div className="line-stat">
                                <dt>Actual cash value</dt>
                                <dd>
                                  {item.cashValueUsd == null ? (item.priceUsd == null ? "—" : "Needs the year") : formatMoney(item.cashValueUsd)}
                                  {item.count > 1 && cashTotal != null ? <span className="line-stat-note">{formatMoney(cashTotal)} for {item.count}</span> : null}
                                </dd>
                              </div>
                              <div className="line-stat">
                                <dt>Priced from</dt>
                                <dd>
                                  {verified ? (
                                    "Your receipt"
                                  ) : source ? (
                                    <a href={source} rel="noreferrer noopener" target="_blank">
                                      Store page
                                    </a>
                                  ) : item.priceUsd != null ? (
                                    "Not checked yet"
                                  ) : (
                                    "—"
                                  )}
                                  {item.pricedAt && source && !verified ? <span className="line-stat-note">{formatWhen(item.pricedAt)}</span> : null}
                                </dd>
                              </div>
                            </dl>
                            {attention ? <p className="line-next">To raise it: {attention}</p> : null}
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

                            {(() => {
                              const replay = replayFor(item);
                              return replay ? <LineReplay {...replay} /> : null;
                            })()}
                            {item.identityCheck && item.identityCheck.result !== "single" ? (
                              <div className={readsDisagree(item) ? "read-twice is-unsure" : "read-twice"}>
                                <p className="read-twice-title">
                                  {item.identityCheck.result === "confirmed"
                                    ? "Read twice by Muse Spark 1.3: both reads agree."
                                    : item.identityCheck.resolved
                                      ? "Read twice by Muse Spark 1.3: the reads disagreed, and you chose."
                                      : "Read twice by Muse Spark 1.3: the two reads disagree. This line stays unsure instead of picking one."}
                                </p>
                                <div className="read-twice-reads">
                                  {item.identityCheck.reads.map((read, index) => (
                                    <div key={index} className="read-twice-read">
                                      <span className="read-twice-label">Read {index + 1}</span>
                                      <strong>{readOneLine(read)}</strong>
                                      {read?.evidence ? <span>{read.evidence}</span> : null}
                                    </div>
                                  ))}
                                </div>
                                {item.identityCheck.result === "confirmed" ? (
                                  <p className="read-twice-note">Two reads that agree back this version on the line. It is a check, not verification; a receipt verifies it.</p>
                                ) : null}
                                {readsDisagree(item) && onResolveIdentity ? (
                                  <div className="film-room-hint-actions">
                                    <button type="button" className="film-room is-add" onClick={() => onResolveIdentity(item.id, "a")}>
                                      Use read 1
                                    </button>
                                    <button type="button" className="film-room is-add" onClick={() => onResolveIdentity(item.id, "b")}>
                                      Use read 2
                                    </button>
                                    <button type="button" className="film-room" onClick={() => onResolveIdentity(item.id, "neither")}>
                                      Neither
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            <p className="line-section-title">Update this item</p>
                            <dl className="line-values">
                              <div className="line-paid">
                                <dt>
                                  <label htmlFor={`year-${item.id}`}>Year bought</label>
                                </dt>
                                <dd>
                                  <input
                                    key={`${item.id}-${item.ageYears ?? "none"}`}
                                    id={`year-${item.id}`}
                                    inputMode="numeric"
                                    maxLength={4}
                                    defaultValue={item.ageYears == null ? "" : String(new Date().getFullYear() - Math.round(item.ageYears))}
                                    placeholder="Sets the cash value"
                                    onChange={(event) => {
                                      const text = event.target.value.trim();
                                      if (text === "" || text.length === 4) setYearBought(room.id, item, text);
                                    }}
                                  />
                                </dd>
                              </div>
                              <div className="line-paid">
                                <dt>
                                  <label htmlFor={`paid-${item.id}`}>Amount paid</label>
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
                              <div className="line-paid">
                                <dt>
                                  <label htmlFor={`declared-${item.id}`}>Self declared value</label>
                                </dt>
                                <dd>
                                  <input
                                    id={`declared-${item.id}`}
                                    inputMode="decimal"
                                    value={item.selfDeclaredUsd ?? ""}
                                    placeholder="Your own figure"
                                    onChange={(event) => {
                                      const text = event.target.value.trim().replace(/[$,]/g, "");
                                      if (text === "") {
                                        onUpdateItem(inventoryId, room.id, item.id, { selfDeclaredUsd: null });
                                        return;
                                      }
                                      const amount = Number(text);
                                      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return;
                                      onUpdateItem(inventoryId, room.id, item.id, { selfDeclaredUsd: amount });
                                    }}
                                  />
                                  {item.selfDeclaredUsd != null ? <span className="self-declared-label">Self declared value</span> : null}
                                </dd>
                              </div>
                              <div className="line-paid">
                                <dt>
                                  <label htmlFor={`appraisal-${item.id}`}>Formal appraisal</label>
                                </dt>
                                <dd>
                                  <input
                                    id={`appraisal-${item.id}`}
                                    inputMode="decimal"
                                    value={item.appraisalUsd ?? ""}
                                    placeholder="Only if it was formally appraised"
                                    onChange={(event) => {
                                      const text = event.target.value.trim().replace(/[$,]/g, "");
                                      if (text === "") {
                                        setAppraisal(room.id, item, null);
                                        return;
                                      }
                                      const amount = Number(text);
                                      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return;
                                      setAppraisal(room.id, item, amount);
                                    }}
                                  />
                                  {appraisalDocumented(item) ? (
                                    <span className="paid-source is-verified">Appraisal attached</span>
                                  ) : (
                                    <label className="text-button line-attach-appraisal">
                                      {item.appraisalUsd != null ? "Attach the appraisal · until then this is a stated price" : "Attach the appraisal"}
                                      <input
                                        type="file"
                                        accept="image/*,application/pdf,.pdf"
                                        onChange={(event) => {
                                          const file = event.target.files?.[0];
                                          event.target.value = "";
                                          if (file) void attachFile(room.id, item, file, true);
                                        }}
                                      />
                                    </label>
                                  )}
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

                            {item.options.length > 0 ? (
                              <p className="line-note">
                                Could be {item.options.map((option) => `${option.label} (${formatMoney(option.lowUsd)}–${formatMoney(option.highUsd)})`).join("; ")}. A
                                close photo of the label settles it.
                              </p>
                            ) : null}

                            <label className="field line-description">
                              <span>Your description</span>
                              <textarea
                                rows={2}
                                maxLength={500}
                                value={item.userNote}
                                placeholder="Add what a reviewer should know about this item"
                                onChange={(event) => onUpdateItem(inventoryId, room.id, item.id, { userNote: event.target.value })}
                              />
                            </label>

                            {item.files.length > 0 ? (
                              <ul className="line-files">
                                {item.files.map((file) => (
                                  <li key={file.id}>
                                    {file.url ? (
                                      <a href={file.url} target="_blank" rel="noreferrer">
                                        {file.name}
                                      </a>
                                    ) : (
                                      <span>{file.name}</span>
                                    )}
                                    <button
                                      type="button"
                                      className="text-button"
                                      onClick={() => onUpdateItem(inventoryId, room.id, item.id, { files: item.files.filter((entry) => entry.id !== file.id) })}
                                    >
                                      Remove
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : null}

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
                              <label className="button quiet line-action">
                                Attach a file
                                <input
                                  type="file"
                                  accept="image/*,application/pdf,.pdf"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) void attachFile(room.id, item, file);
                                  }}
                                />
                              </label>
                              <VoiceNote
                                inventoryId={inventoryId}
                                disabled={busy}
                                onText={(text) => void answerFor(room.id, item, text, "transcript")}
                              />
                              {item.declared ? (
                                <span className="paid-source">Declared by you</span>
                              ) : (
                                <button type="button" className="text-button" onClick={() => onUpdateItem(inventoryId, room.id, item.id, { declared: true })}>
                                  Declare
                                </button>
                              )}
                              {confirmDelete === item.id ? (
                                <span className="line-confirm">
                                  <button type="button" className="text-button is-danger" onClick={() => onDeleteItem(inventoryId, room.id, item.id)}>
                                    Delete from this inventory
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
                                How this was valued · {mark.met} of {mark.total} evidence signals
                              </summary>
                              <dl>
                                <dt>Summary</dt>
                                <dd>{lineStory(item)}</dd>
                                {item.depreciationNote ? (
                                  <>
                                    <dt>Cash value</dt>
                                    <dd>{item.depreciationNote}</dd>
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
                                    <dt>Shown on the walkthrough</dt>
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
                      </Fragment>
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
