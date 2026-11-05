"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  cashValueTotal,
  cashValueUnknown,
  enteredTotal,
  formatClock,
  formatMoney,
  formatWhen,
  inventoryCsv,
  inventoryLabel,
  locationWithin,
  proofText,
  replacementTotal,
  videoExtension,
  type HomeInventory,
  type ScanClip,
} from "../lib/inventory";
import { assessedReplacement } from "../lib/line-confidence";
import { addressRegionLabel } from "../lib/address-search";
import { downloadJson } from "../lib/inventory-export";
import { clipRoomLabel } from "../lib/scan-rooms";
import { askSameObject, photoBlob, verdictText } from "../lib/same-object-client";
import { walkCounts, walkLabel } from "../lib/walk-compare";
import { isUnfinished, linesMissingPictures, savedStills, sealFromSaved } from "../lib/finish-scan";
import { cutFrames } from "../lib/clip-frames";
import { AddressLine } from "./AddressLine";
import { useInventory } from "./InventoryProvider";
import { InventoryMeasures } from "./InventoryMeasures";
import { ItemizedRooms } from "./ItemizedRooms";
import { Loader } from "./Loader";

function downloadProof(inventory: HomeInventory) {
  const blob = new Blob([inventoryCsv(inventory)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "100proof-inventory.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadVideo(clip: ScanClip, index: number) {
  const link = document.createElement("a");
  link.href = clip.videoUrl;
  link.download = `100proof-walkthrough-${index + 1}.${videoExtension(clip.mediaType)}`;
  link.click();
}

const steps = [
  {
    title: "Start",
    body: "Enter the property address, then walk the rooms with your phone.",
  },
  {
    title: "Record",
    body: "Film up to 15 minutes. Hold the camera on a brand, model number, or serial label. A label you can read is what makes that line accurate.",
  },
  {
    title: "Recognize",
    body: "The walk comes back as rooms and counts. A brand, model, or serial read from the video stays on that line.",
  },
  {
    title: "Proof",
    body: "Download the inventory when it is ready. After you submit, open a line and take a picture of the receipt, or upload one. The receipt updates that value. Coverage stays with the carrier.",
  },
];

function mailHref(inventory: HomeInventory) {
  const subject = encodeURIComponent(`100proof ${inventoryLabel(inventory)}`);
  const body = encodeURIComponent(proofText(inventory));
  return `mailto:?subject=${subject}&body=${body}`;
}

function createdOn(inventory: HomeInventory) {
  return inventory.sealedAt ?? inventory.clips[0]?.startedAt ?? inventory.createdAt;
}

function listFacts(inventory: HomeInventory) {
  const when = createdOn(inventory);
  const facts: string[] = [];
  if (when) facts.push(formatWhen(when));
  if (inventory.loaded) {
    const items = inventory.rooms.reduce(
      (sum, room) => sum + room.items.filter((item) => !item.hidden).reduce((count, item) => count + item.count, 0),
      0,
    );
    if (items > 0) facts.push(`${items} ${items === 1 ? "item" : "items"}`);
  }
  return facts.join(" · ");
}

const SAVE_LINES = {
  idle: "",
  saving: "Saving to your account.",
  saved: "Saved to your account.",
  failed: "Not saved yet. It will try again on the next change.",
} as const;

export function InventoryDocument() {
  const router = useRouter();
  const {
    inventories,
    selected,
    saveState,
    startInventory,
    selectInventory,
    loadInventory,
    renameRoom,
    deleteRoomItem,
    updateRoomItem,
    addRoomItem,
    applyEvidence,
    saveMedia,
    processingIds,
    listReady,
    deleteInventory,
    answerRoomQuestion,
    answerRepeatQuestion,
    setRepeatCheck,
    resolveIdentityCheck,
    markProcessing,
    sealRecord,
    listMedia,
  } = useInventory();
  const [roomAnswer, setRoomAnswer] = useState("");
  const [finishing, setFinishing] = useState<{ done: number; total: number } | null>(null);

  /**
   * Finish a scan that was cut off. First the stills it already uploaded are put back on their lines.
   * Then the rest are cut from the saved clips, one clip load each. The record is sealed after both.
   */
  async function finishNow(inventory: HomeInventory) {
    if (finishing) return;
    const missing = linesMissingPictures(inventory);
    setFinishing({ done: 0, total: missing.length });
    markProcessing(inventory.id, true);
    let done = 0;
    const step = () => {
      done += 1;
      setFinishing({ done, total: missing.length });
    };
    try {
      const saved = savedStills(await listMedia(inventory.id), inventory.clips.map((clip) => clip.id));
      const toCut = new Map<string, { src: string; lines: typeof missing }>();
      for (const line of missing) {
        const still = saved.get(line.item.id.slice(0, 8).toLowerCase());
        if (still) {
          updateRoomItem(inventory.id, line.roomId, line.item.id, { photoPath: still.path, photoUrl: still.url });
          step();
          continue;
        }
        if (!line.clipId || !line.src || line.atSec == null) {
          step();
          continue;
        }
        const group = toCut.get(line.clipId) ?? { src: line.src, lines: [] };
        group.lines.push(line);
        toCut.set(line.clipId, group);
      }
      const groups = [...toCut.values()];
      for (let index = 0; index < groups.length; index += 2) {
        await Promise.all(
          groups.slice(index, index + 2).map(async ({ src, lines }) => {
            const blobs = await cutFrames(src, lines.map((line) => line.atSec ?? 0));
            await Promise.all(
              lines.map(async (line, at) => {
                const blob = blobs[at];
                if (blob) {
                  const path = await saveMedia(inventory.id, `${line.item.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}.jpg`, blob);
                  if (path) updateRoomItem(inventory.id, line.roomId, line.item.id, { photoPath: path, photoUrl: URL.createObjectURL(blob) });
                }
                step();
              }),
            );
          }),
        );
      }
      const sealedAt = new Date().toISOString();
      sealRecord(inventory.id, await sealFromSaved(inventory, sealedAt), sealedAt);
    } finally {
      markProcessing(inventory.id, false);
      setFinishing(null);
    }
  }
  const [checkingRepeat, setCheckingRepeat] = useState<string | null>(null);
  /** Each saved question gets one photo comparison, the first time it is shown. */
  const checkedRepeatsRef = useRef(new Set<string>());
  const [openId, setOpenId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [openStep, setOpenStep] = useState<number | null>(null);
  const saved = inventories.filter((inventory) => inventory.savedVersion !== 0 || inventory.clips.length > 0);
  const opened = saved.find((inventory) => inventory.id === openedId) ?? null;
  const clips = opened?.clips ?? [];
  const items = opened?.items ?? [];
  const hasValue = items.some((item) => item.value != null);

  function newScan() {
    if (selected && selected.clips.length === 0) {
      router.push("/scan");
      return;
    }
    startInventory();
    router.push("/scan");
  }

  function openSaved(inventory: HomeInventory) {
    selectInventory(inventory.id);
    setSummaryOpen(false);
    setLoadError("");
    setOpenedId(inventory.id);
    if (!inventory.loaded) {
      void loadInventory(inventory.id).then((ok) => {
        if (!ok) setLoadError("This inventory did not open. Try it again.");
      });
    }
  }

  function scanMore(inventoryId: string) {
    selectInventory(inventoryId);
    router.push("/scan?add=1");
  }

  useEffect(() => {
    if (!summaryOpen) return;
    document.getElementById("summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [summaryOpen]);

  const waitingRepeat = opened?.loaded ? (opened.repeatQuestions?.[0] ?? null) : null;
  useEffect(() => {
    if (!opened || !waitingRepeat || waitingRepeat.check || checkedRepeatsRef.current.has(waitingRepeat.id)) return;
    checkedRepeatsRef.current.add(waitingRepeat.id);
    const lines = opened.rooms.flatMap((room) => room.items);
    const lineA = lines.find((line) => line.id === waitingRepeat.aId);
    const lineB = lines.find((line) => line.id === waitingRepeat.bId);
    if (!lineA?.photoUrl || !lineB?.photoUrl) return;
    const inventoryId = opened.id;
    const question = waitingRepeat;
    setCheckingRepeat(question.id);
    void (async () => {
      const [a, b] = await Promise.all([photoBlob(lineA.photoUrl), photoBlob(lineB.photoUrl)]);
      const check =
        a && b
          ? await askSameObject(
              inventoryId,
              { name: question.aName, room: question.aRoom, detail: lineA.detail, image: a },
              { name: question.bName, room: question.bRoom, detail: lineB.detail, image: b },
            )
          : null;
      if (check) setRepeatCheck(inventoryId, question.id, check);
      setCheckingRepeat((current) => (current === question.id ? null : current));
    })();
    // One comparison per question; the ref keeps it from running again when the inventory re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingRepeat?.id, opened?.id]);

  async function sendProof() {
    if (!opened) return;
    const text = proofText(opened);
    if (navigator.share) {
      try {
        await navigator.share({ title: `100proof ${inventoryLabel(opened)}`, text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    window.location.href = mailHref(opened);
  }

  const returning = saved.length > 0;

  if (!listReady) {
    return (
      <div className="narrow inventory-loading" aria-busy="true">
        <Loader size={72} layout="inline" />
      </div>
    );
  }

  return (
    <div className="narrow view-enter">
      {opened ? (
        <button type="button" className="text-button inventory-back" onClick={() => setOpenedId(null)}>
          All inventories
        </button>
      ) : (
        <>
          <div className="inventory-heading">
            <h1 className="inventory-title">My inventory</h1>
            {returning ? (
              <button type="button" className="button inventory-new" onClick={newScan}>
                <span aria-hidden="true">+</span>
                New
              </button>
            ) : null}
          </div>
          {returning ? null : (
            <div className="first-inventory">
              <p className="first-inventory-lead">Tap each step, then Begin when you are ready.</p>
              <ol className="steps">
                {steps.map((step, index) => {
                  const open = openStep === index;
                  return (
                    <li key={step.title} className={open ? "is-open" : undefined}>
                      <button
                        type="button"
                        className="step-tab"
                        aria-expanded={open}
                        aria-controls="step-detail"
                        onClick={() => setOpenStep(open ? null : index)}
                      >
                        <span className="index">0{index + 1}</span>
                        <span className="step-title">{step.title}</span>
                      </button>
                      {index < steps.length - 1 ? (
                        <span className="step-arrow" aria-hidden="true">
                          <svg viewBox="0 0 28 16">
                            <path d="M2 8h16" />
                            <path d="M14 3.5 22 8l-8 4.5" />
                          </svg>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <div
                className={openStep == null ? "step-detail" : "step-detail is-open"}
                id="step-detail"
                role="region"
                aria-live="polite"
              >
                <div className="step-detail-body">
                  {openStep != null ? <p key={steps[openStep].title}>{steps[openStep].body}</p> : null}
                </div>
              </div>
              <button type="button" className="button inventory-begin" onClick={newScan}>
                Begin your first inventory now!
              </button>
            </div>
          )}
          {returning ? (
            <>
            <ul className="inventory-picks">
              {[...saved]
                .sort((a, b) => Number(processingIds.includes(b.id)) - Number(processingIds.includes(a.id)))
                .map((inventory) => {
                const cover = inventory.coverUrl || inventory.clips[0]?.posterUrl;
                const facts = listFacts(inventory);
                const saving = processingIds.includes(inventory.id);
                const unfinished = !saving && isUnfinished(inventory);
                const confirming = confirmDelete === inventory.id;
                const deleting = deletingId === inventory.id;
                return (
                  <li key={inventory.id} className="inventory-card">
                    <div className="inventory-row">
                      <button
                        type="button"
                        className={saving ? "inventory-pick is-saving" : "inventory-pick"}
                        disabled={saving}
                        aria-disabled={saving}
                        onClick={() => openSaved(inventory)}
                        onPointerEnter={() => {
                          if (!saving && !inventory.loaded) void loadInventory(inventory.id);
                        }}
                        onFocus={() => {
                          if (!saving && !inventory.loaded) void loadInventory(inventory.id);
                        }}
                      >
                        <span className="inventory-pick-photo">
                          {cover ? (
                            // The still is the highest priced item kept with this inventory.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" loading="lazy" />
                          ) : (
                            <span className="inventory-pick-empty" aria-hidden="true" />
                          )}
                        </span>
                        <span className="inventory-pick-copy">
                          <span className="inventory-pick-title">{inventoryLabel(inventory)}</span>
                          {saving ? (
                            <span className="inventory-saving">
                              Scan will be completed soon
                              <span className="saving-dots" aria-hidden="true">
                                <i />
                                <i />
                                <i />
                              </span>
                            </span>
                          ) : unfinished ? (
                            <span className="inventory-saving is-unfinished">Not finished · open it to finish the photos and the seal</span>
                          ) : facts ? (
                            <span className="inventory-pick-date">{facts}</span>
                          ) : null}
                        </span>
                      </button>
                      {saving ? null : (
                        <button
                          type="button"
                          className="inventory-trash"
                          aria-label={`Delete ${inventoryLabel(inventory)}`}
                          onClick={() => {
                            setDeleteError("");
                            setConfirmDelete(inventory.id);
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 7h16" />
                            <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
                            <path d="M7 7.5l.7 11.2A1.5 1.5 0 0 0 9.2 20h5.6a1.5 1.5 0 0 0 1.5-1.3L17 7.5" />
                            <path d="M10 11v5.5M14 11v5.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {confirming ? (
                      <div className="inventory-confirm">
                        <p>Delete {inventoryLabel(inventory)}? This removes the inventory, its video, and its pictures from your account.</p>
                        <div className="inventory-confirm-actions">
                          <button
                            type="button"
                            className="text-button is-delete"
                            disabled={deleting}
                            aria-busy={deleting}
                            onClick={() => {
                              if (deletingRef.current) return;
                              deletingRef.current = inventory.id;
                              setDeleteError("");
                              setDeletingId(inventory.id);
                              void deleteInventory(inventory.id)
                                .then((ok) => {
                                  if (!ok) {
                                    setDeleteError("This inventory did not delete.");
                                    return;
                                  }
                                  if (openedId === inventory.id) setOpenedId(null);
                                  setConfirmDelete(null);
                                })
                                .catch(() => {
                                  setDeleteError("This inventory did not delete.");
                                })
                                .finally(() => {
                                  deletingRef.current = null;
                                  setDeletingId(null);
                                });
                            }}
                          >
                            {deleting ? (
                              <span className="saving-dots on-delete" aria-label="Deleting">
                                <i />
                                <i />
                                <i />
                              </span>
                            ) : (
                              "Delete"
                            )}
                          </button>
                          <button type="button" className="text-button" disabled={deleting} onClick={() => setConfirmDelete(null)}>
                            Keep
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {deleteError ? <p className="form-error">{deleteError}</p> : null}
            </>
          ) : null}
        </>
      )}
      {opened && !opened.loaded ? (
        <article className="sheet scan-portal" aria-busy={loadError ? undefined : true}>
          {opened.coverUrl ? (
            // The cover is the still already shown on the list.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="scan-portal-cover" src={opened.coverUrl} alt="" />
          ) : (
            <Loader size={72} layout="inline" />
          )}
          <h1 className="inventory-open-title">{inventoryLabel(opened)}</h1>
          {loadError ? (
            <>
              <p className="form-error">{loadError}</p>
              <button type="button" className="button quiet" onClick={() => openSaved(opened)}>
                Try again
              </button>
            </>
          ) : (
            <>
              <p className="hint">Opening this inventory.</p>
              <span className="scan-portal-bar" aria-hidden="true" />
            </>
          )}
        </article>
      ) : null}
      {opened && opened.loaded ? (
      <article className="sheet inventory-open" key={opened.id}>
        <h1 className="inventory-open-title">{inventoryLabel(opened)}</h1>
        {listFacts(opened) ? <p className="inventory-open-facts">{listFacts(opened)}</p> : null}
        {addressRegionLabel(opened.addressRegion) ? (
          <p className="confirm-address">{addressRegionLabel(opened.addressRegion)}</p>
        ) : null}
        {opened.homeAddress.trim() ? <AddressLine address={opened.homeAddress.trim()} within={locationWithin(opened)} /> : null}
        {opened.recordHash && opened.sealedAt ? (
          <p className="record-hash" title={opened.recordHash}>
            Sealed {formatWhen(opened.sealedAt)} · record {opened.recordHash.slice(0, 12)}…
          </p>
        ) : null}
        {SAVE_LINES[saveState] ? <p className="hint">{SAVE_LINES[saveState]}</p> : null}
        {clips.length > 0 ? (
          <details className="clip-fold">
            <summary>
              <span>Walkthrough video</span>
              <span className="room-meta">
                {clips.length} {clips.length === 1 ? "clip" : "clips"} · {formatClock(clips.reduce((sum, clip) => sum + clip.durationMs, 0))}
              </span>
              <span className="fold-mark" aria-hidden="true" />
            </summary>
        <ul className="rooms">
          {clips.map((clip, index) => {
            const open = openId === clip.id;
            const rooms = clipRoomLabel(clip.rooms);
            const title = rooms ? `Clip ${index + 1} · ${rooms}` : `Clip ${index + 1}`;
            return (
              <li key={clip.id} className="room">
                <button type="button" className="room-main" aria-expanded={open} onClick={() => setOpenId(open ? null : clip.id)}>
                  <span className="thumb">
                    {clip.posterUrl ? (
                      // The still is a frame from the scan just recorded in this browser.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={clip.posterUrl} alt="" />
                    ) : null}
                  </span>
                  <span className="room-copy">
                    <span className="room-name">{title}</span>
                    <span className="room-items">
                      {formatWhen(clip.startedAt)} · {formatClock(clip.durationMs)} ·{" "}
                      {clip.storagePath ? "kept on your account" : "on this device"}
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="room-detail">
                    {clip.videoUrl ? (
                      <video src={clip.videoUrl} controls playsInline preload="metadata" poster={clip.posterUrl || undefined} />
                    ) : (
                      <p>This clip did not upload, so it is not on your account.</p>
                    )}
                    <p>Recorded {formatWhen(clip.startedAt)}. Download a copy to this device if you want one.</p>
                    {clip.videoUrl ? (
                      <button type="button" className="button quiet" onClick={() => downloadVideo(clip, index)}>
                        Download video
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
          </details>
        ) : null}
        {items.length > 0 ? (
        <ul className="rooms">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className="room">
                <button type="button" className="room-main" aria-expanded={open} onClick={() => setOpenId(open ? null : item.id)}>
                  <span className="thumb">
                    {item.photoUrl ? (
                      // The picture was chosen on this device for this item.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photoUrl} alt="" />
                    ) : null}
                  </span>
                  <span className="room-copy">
                    <span className="room-name">{item.name}</span>
                    <span className="room-items">{item.description}</span>
                  </span>
                  <span className={item.value == null ? "value-pill pending" : "value-pill"}>
                    {item.value == null ? "No price" : formatMoney(item.value)}
                  </span>
                </button>
                {open ? (
                  <div className="room-detail">
                    <p>Entered by you. This is not a scan estimate.</p>
                    {item.sourceUrl && item.sourceName ? (
                      <a className="button quiet" href={item.sourceUrl} download={item.sourceName}>
                        Download {item.sourceName}
                      </a>
                    ) : (
                      <p>No source attached yet.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        ) : null}
        {finishing || (isUnfinished(opened) && !processingIds.includes(opened.id)) ? (
          <div className="finish-row" role="status" aria-live="polite">
            <span>
              {finishing
                ? `Finishing · pictures ${finishing.done} of ${finishing.total}`
                : "Not finished · the line pictures and the seal did not save"}
            </span>
            <button type="button" className="button quiet" disabled={finishing != null} onClick={() => void finishNow(opened)}>
              {finishing ? "Finishing" : "Finish now"}
            </button>
          </div>
        ) : null}
        <ItemizedRooms
          inventoryId={opened.id}
          rooms={opened.rooms}
          clips={opened.clips}
          address={opened.homeAddress}
          region={addressRegionLabel(opened.addressRegion)}
          onRenameRoom={renameRoom}
          onDeleteItem={deleteRoomItem}
          onUpdateItem={updateRoomItem}
          onAddItem={addRoomItem}
          onEvidence={applyEvidence}
          onSaveMedia={saveMedia}
          onResolveIdentity={(itemId, pick) => resolveIdentityCheck(opened.id, itemId, pick)}
          walk={opened.walkCompare ?? null}
        />
        {opened.roomQuestions?.length || opened.repeatQuestions?.length || opened.walkCompare || roomAnswer ? (
          <details className="sheet scan-notes">
            <summary>
              <span>Scan review</span>
              <span className="room-meta">
                {(opened.roomQuestions?.length ?? 0) + (opened.repeatQuestions?.length ?? 0) > 0
                  ? `${(opened.roomQuestions?.length ?? 0) + (opened.repeatQuestions?.length ?? 0)} to check`
                  : "Nothing to check"}
              </span>
              <span className="fold-mark" aria-hidden="true" />
            </summary>
        {opened.roomQuestions?.length ? (
          <div className="sheet room-question" role="status" aria-live="polite">
            {(() => {
              const question = opened.roomQuestions[0];
              if (!question) return null;
              const more = opened.roomQuestions.length - 1;
              return (
                <>
                  <p>
                    Clip {question.clip} looks like {question.room} from {formatClock(question.atSec * 1000)}, but {question.tapped} was tapped.
                    {more > 0 ? ` ${more} more after this.` : ""}
                  </p>
                  <div className="film-room-hint-actions">
                    <button
                      type="button"
                      className="film-room is-add"
                      onClick={() => {
                        const moved = answerRoomQuestion(opened.id, question.id, true);
                        setRoomAnswer(
                          moved > 0
                            ? `Moved ${moved} ${moved === 1 ? "line" : "lines"} from clip ${question.clip} to ${question.room}.`
                            : `Nothing moved. Those lines were also seen in another clip, so they stay in ${question.tapped}.`,
                        );
                      }}
                    >
                      Move those lines to {question.room}
                    </button>
                    <button
                      type="button"
                      className="film-room"
                      onClick={() => {
                        answerRoomQuestion(opened.id, question.id, false);
                        setRoomAnswer("");
                      }}
                    >
                      Keep {question.tapped}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
        {roomAnswer ? <p className="hint">{roomAnswer}</p> : null}
        {opened.walkCompare ? (
          <div className="sheet walk-compare" role="status">
            {(() => {
              const compare = opened.walkCompare;
              const counts = walkCounts(compare);
              const notSeen = compare.entries.filter((entry) => entry.status === "not seen");
              return (
                <>
                  <p className="walk-compare-head">
                    Before and after, walk of {new Date(compare.at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}: {counts.seen + counts.moved + counts.changed} seen again
                    {counts.moved > 0 ? `, ${counts.moved} moved` : ""}
                    {counts.changed > 0 ? `, ${counts.changed} with new damage` : ""}
                    {counts.possible > 0 ? `, ${counts.possible} possible ${counts.possible === 1 ? "match" : "matches"}` : ""}, {counts.notSeen} not seen, {counts.notChecked} not checked, {counts.added} new.
                  </p>
                  {notSeen.length > 0 ? (
                    <ul className="walk-compare-list">
                      {notSeen.slice(0, 8).map((entry) => (
                        <li key={entry.ids.join("|")}>
                          <strong>{entry.name}</strong> · {entry.room} · {walkLabel(entry, compare.since)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="read-twice-note">Not seen means this walk did not show it. It does not mean missing. Rooms the walk did not enter are not checked.</p>
                </>
              );
            })()}
          </div>
        ) : null}
        {opened.repeatQuestions?.length ? (
          <div className="sheet room-question" role="status" aria-live="polite">
            {(() => {
              const question = opened.repeatQuestions[0];
              if (!question) return null;
              const more = opened.repeatQuestions.length - 1;
              const lines = opened.rooms.flatMap((room) => room.items);
              const sides = [
                { id: question.aId, name: question.aName, room: question.aRoom },
                { id: question.bId, name: question.bName, room: question.bRoom },
              ].map((side) => ({ ...side, line: lines.find((line) => line.id === side.id) ?? null }));
              return (
                <>
                  <p>
                    Possible repeat. {question.reason}
                    {more > 0 ? ` ${more} more after this.` : ""}
                  </p>
                  <div className="repeat-pair">
                    {sides.map((side) => (
                      <div className="repeat-side" key={side.id}>
                        {side.line?.photoUrl ? (
                          // A still from this inventory's own scan, served by an expiring link.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={side.line.photoUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="repeat-thumb" aria-hidden="true" />
                        )}
                        <strong>{side.name}</strong>
                        <span>{side.room}</span>
                      </div>
                    ))}
                  </div>
                  {verdictText(question.check, checkingRepeat === question.id) ? (
                    <p className="repeat-verdict">{verdictText(question.check, checkingRepeat === question.id)}</p>
                  ) : null}
                  <div className="film-room-hint-actions">
                    <button
                      type="button"
                      className="film-room is-add"
                      onClick={() => {
                        const merged = answerRepeatQuestion(opened.id, question.id, true);
                        setRoomAnswer(merged ? `Merged into one line, seen in ${question.aRoom === question.bRoom ? question.aRoom : `${question.aRoom} and ${question.bRoom}`}.` : "Those lines are no longer both on the list.");
                      }}
                    >
                      Same item
                    </button>
                    <button
                      type="button"
                      className="film-room"
                      onClick={() => {
                        answerRepeatQuestion(opened.id, question.id, false);
                        setRoomAnswer("");
                      }}
                    >
                      Two items
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
          </details>
        ) : null}
        <div className="sheet-actions">
          <button type="button" className="button quiet" onClick={() => scanMore(opened.id)}>
            Scan more
          </button>
          <button type="button" className="button brand" aria-expanded={summaryOpen} onClick={() => setSummaryOpen((open) => !open)}>
            View summary
          </button>
        </div>
      </article>
      ) : null}
      {opened && summaryOpen ? (
        <section className="sheet summary" id="summary">
          <p className="total-label">Summary</p>
          <h2>Proof document</h2>
          <p className="total-note">
            Download the inventory, email it, or send it. A line is in the assessed value at 75% or above when it is under $250, and at 85% or above
            when it is over. A receipt or an attached appraisal is 99%. 100proof does not decide coverage, and this file is not a sworn proof of loss.
          </p>
          <p className="summary-total">
            <span>Assessed value</span>
            <span>
              {formatMoney(assessedReplacement(opened.rooms.flatMap((room) => room.items)))}
            </span>
          </p>
          <p className="summary-total">
            <span>Replacement estimate</span>
            <span>{replacementTotal(opened) > 0 ? formatMoney(replacementTotal(opened)) : "—"}</span>
          </p>
          <p className="summary-total">
            <span>Cash value estimate</span>
            <span>{cashValueTotal(opened) > 0 ? formatMoney(cashValueTotal(opened)) : "—"}</span>
          </p>
          {cashValueUnknown(opened) > 0 ? (
            <p className="total-note">
              {cashValueUnknown(opened)} {cashValueUnknown(opened) === 1 ? "line has" : "lines have"} no cash value yet because the age is not known. Add the
              year bought on the line, or a photo of its label, to set it.
            </p>
          ) : null}
          <p className="summary-total">
            <span>Entered total</span>
            <span>{hasValue ? formatMoney(enteredTotal(items)) : "—"}</span>
          </p>
          <p className="total-note">
            If a covered loss happened today, this record is what you could show your insurer: what you own, the
            evidence behind each line, and what replacement would cost. What comes back depends on your policy —
            its limit, deductible, and whether it pays replacement cost or cash value. Keeping this inventory
            active and current is what keeps that number documented instead of guessed.
          </p>
          <div className="summary-actions">
            <a className="button quiet" href={mailHref(opened)}>
              Email
            </a>
            <button type="button" className="button quiet" onClick={sendProof}>
              Send
            </button>
            <button type="button" className="button" onClick={() => downloadProof(opened)}>
              Download
            </button>
            <button type="button" className="button quiet" onClick={() => downloadJson(opened)}>
              Claim file (JSON)
            </button>
          </div>
          <InventoryMeasures inventory={opened} />
        </section>
      ) : null}
    </div>
  );
}
