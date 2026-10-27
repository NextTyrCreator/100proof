"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  enteredTotal,
  formatClock,
  formatMoney,
  formatWhen,
  inventoryCsv,
  inventoryLabel,
  proofText,
  videoExtension,
  type HomeInventory,
  type ScanClip,
} from "../lib/inventory";
import { useInventory } from "./InventoryProvider";

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
    body: "Begin scan and record up to 100 seconds, captured at that moment and kept with this account.",
  },
  {
    title: "Recognize",
    body: "Rooms, quantities, and serials. You keep or correct each item.",
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
  return inventory.sealedAt ?? inventory.clips[0]?.startedAt ?? "";
}

export function InventoryDocument() {
  const router = useRouter();
  const { inventories, selected, startInventory, selectInventory, renameRoom, deleteRoomItem } = useInventory();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const saved = inventories.filter((inventory) => inventory.clips.length > 0);
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

  function openSaved(id: string) {
    selectInventory(id);
    setSummaryOpen(false);
    setOpenedId((current) => (current === id ? null : id));
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
            const clip = inventory.clips[0];
            const when = createdOn(inventory);
            return (
              <li key={inventory.id}>
                <button
                  type="button"
                  className="inventory-pick"
                  aria-pressed={inventory.id === openedId}
                  onClick={() => openSaved(inventory.id)}
                >
                  <span className="inventory-pick-photo">
                    {clip?.posterUrl ? (
                      // The still is a frame from the scan kept with this inventory.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={clip.posterUrl} alt="" />
                    ) : null}
                  </span>
                  <span className="inventory-pick-copy">
                    <span className="inventory-pick-title">{inventoryLabel(inventory)}</span>
                    {when ? <span className="inventory-pick-date">{formatWhen(when)}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {opened ? (
      <article className="sheet">
        <p className="total-label">{inventoryLabel(opened)}</p>
        {opened.homeAddress.trim() ? <p className="confirm-address">{opened.homeAddress.trim()}</p> : null}
        {opened.recordHash ? <p className="record-hash">Record {opened.recordHash}</p> : null}
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
                      {formatWhen(clip.startedAt)} · {formatClock(clip.durationMs)} · source kept
                    </span>
                  </span>
                  <span className="value-pill pending">Pending</span>
                </button>
                {open ? (
                  <div className="room-detail">
                    <video src={clip.videoUrl} controls playsInline poster={clip.posterUrl || undefined} />
                    <p>
                      Recorded {formatWhen(clip.startedAt)}. The source video stays with this proof. Download it to
                      this device as well.
                    </p>
                    <button type="button" className="button quiet" onClick={() => downloadVideo(clip, index)}>
                      Download video
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
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
        {opened.rooms.length > 0 ? (
          <ul className="rooms">
            {opened.rooms.map((room) => (
              <li key={room.id} className="room">
                <label className="field">
                  <span>Room</span>
                  <input
                    value={room.title}
                    maxLength={80}
                    onChange={(event) => renameRoom(opened.id, room.id, event.target.value)}
                  />
                </label>
                <ul className="item-list">
                  {room.items.map((item) => (
                    <li key={item.id}>
                      <span>
                        {item.name}
                        {item.serial ? ` · ${item.serial}` : ""}
                        {item.age ? ` · ${item.age}` : ""}
                        {item.priceUsd == null ? "" : ` · ${formatMoney(item.priceUsd)}`}
                      </span>
                      <button type="button" className="text-button" onClick={() => deleteRoomItem(opened.id, room.id, item.id)}>
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-line">
            No rooms listed yet. Rooms are read from a change of room in the video, or from the room you narrate.
          </p>
        )}
        <div className="sheet-actions">
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
            <span>Entered total</span>
            <span>{hasValue ? formatMoney(enteredTotal(items)) : "—"}</span>
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
          </div>
        </section>
      ) : null}
    </div>
  );
}
