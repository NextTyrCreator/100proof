"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  enteredTotal,
  formatClock,
  formatMoney,
  formatWhen,
  cashValueTotal,
  replacementTotal,
  inventoryCsv,
  inventoryLabel,
  locationWithin,
  proofText,
  videoExtension,
  type HomeInventory,
  type ScanClip,
} from "../lib/inventory";
import { addressRegionLabel } from "../lib/address-search";
import { unresolvedCount } from "../lib/evidence-requests";
import { downloadJson } from "../lib/inventory-export";
import { AddressLine } from "./AddressLine";
import { useInventory } from "./InventoryProvider";
import { InventoryMeasures } from "./InventoryMeasures";
import { ItemizedRooms } from "./ItemizedRooms";

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
    body: "Click new scan and enter the property address.",
  },
  {
    title: "Record",
    body: "Record up to 10 minutes, in 30-second clips. Talk as you go: the room, the brand, the year, what you paid.",
  },
  {
    title: "Recognize",
    body: "Rooms, quantities, brands, and serials. Add a photo, a price paid, or a receipt to any line.",
  },
  {
    title: "Proof",
    body: "Download the inventory, submit it to your insurer and cover your assets properly. Coverage stays with the carrier.",
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
    skipRequest,
    saveMedia,
  } = useInventory();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
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
    setOpenedId((current) => (current === inventory.id ? null : inventory.id));
    if (!inventory.loaded) void loadInventory(inventory.id);
  }

  function filmFocus(inventoryId: string, itemIds: string[]) {
    selectInventory(inventoryId);
    const focus = itemIds.slice(0, 10).map(encodeURIComponent).join(",");
    router.push(`/scan?add=1&focus=${focus}`);
  }

  function scanMore(inventoryId: string) {
    selectInventory(inventoryId);
    router.push("/scan?add=1");
  }

  useEffect(() => {
    if (!summaryOpen) return;
    document.getElementById("summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [summaryOpen]);

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

  return (
    <div className="narrow">
      <h1 className="inventory-title">My inventory</h1>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="index">0{index + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="inventory-toolbar">
        <button type="button" className="button brand" onClick={newScan}>
          New scan
        </button>
      </div>
      {saved.length > 0 ? (
        <ul className="inventory-picks">
          {saved.map((inventory) => {
            const cover = inventory.clips[0]?.posterUrl || inventory.coverUrl;
            const when = createdOn(inventory);
            const stillOpen = inventory.loaded ? unresolvedCount(inventory.rooms) : 0;
            return (
              <li key={inventory.id}>
                <button
                  type="button"
                  className="inventory-pick"
                  aria-pressed={inventory.id === openedId}
                  onClick={() => openSaved(inventory)}
                >
                  <span className="inventory-pick-photo">
                    {cover ? (
                      // The still is a frame from the scan kept with this inventory.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" />
                    ) : null}
                  </span>
                  <span className="inventory-pick-copy">
                    <span className="inventory-pick-title">{inventoryLabel(inventory)}</span>
                    {when ? <span className="inventory-pick-date">{formatWhen(when)}</span> : null}
                    {stillOpen > 0 ? <span className="inventory-pick-date">{stillOpen} still open</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {opened && !opened.loaded ? (
        <article className="sheet" aria-busy="true">
          <p className="total-label">{inventoryLabel(opened)}</p>
          <p className="hint">Opening this inventory.</p>
        </article>
      ) : null}
      {opened && opened.loaded ? (
      <article className="sheet">
        <p className="total-label">{inventoryLabel(opened)}</p>
        {addressRegionLabel(opened.addressRegion) ? (
          <p className="confirm-address">{addressRegionLabel(opened.addressRegion)}</p>
        ) : null}
        {opened.homeAddress.trim() ? <AddressLine address={opened.homeAddress.trim()} within={locationWithin(opened)} /> : null}
        {opened.recordHash ? <p className="record-hash">Record {opened.recordHash}</p> : null}
        {SAVE_LINES[saveState] ? <p className="hint">{SAVE_LINES[saveState]}</p> : null}
        {clips.length > 0 ? (
          <details className="clip-fold">
            <summary>
              <span>Source video</span>
              <span className="room-meta">
                {clips.length} {clips.length === 1 ? "clip" : "clips"} · {formatClock(clips.reduce((sum, clip) => sum + clip.durationMs, 0))}
              </span>
              <span className="fold-mark" aria-hidden="true" />
            </summary>
        <ul className="rooms">
          {clips.map((clip, index) => {
            const open = openId === clip.id;
            const title = clips.length > 1 ? `Walkthrough ${index + 1}` : "Walkthrough";
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
                    <p>
                      Recorded {formatWhen(clip.startedAt)}. The source video stays with this proof. Download it to
                      this device as well.
                    </p>
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
          onSkip={skipRequest}
          onSaveMedia={saveMedia}
          onFilmFocus={(itemIds) => filmFocus(opened.id, itemIds)}
          onScanMore={() => scanMore(opened.id)}
        />
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
          <h1>Proof document</h1>
          <p className="total-note">
            Download the inventory, email it, or send it. 100proof does not decide coverage, and this file is not a
            sworn proof of loss.
          </p>
          <p className="summary-total">
            <span>Replacement estimate</span>
            <span>{replacementTotal(opened) > 0 ? formatMoney(replacementTotal(opened)) : "—"}</span>
          </p>
          <p className="summary-total">
            <span>Cash value estimate</span>
            <span>{cashValueTotal(opened) > 0 ? formatMoney(cashValueTotal(opened)) : "—"}</span>
          </p>
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
