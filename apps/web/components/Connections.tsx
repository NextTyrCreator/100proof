"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { receiptVerified } from "../lib/accuracy-mark";
import { formatMoney, inventoryLabel, type HomeInventory } from "../lib/inventory";
import type { ItemPatch } from "../lib/inventory-merge";
import { useInventory } from "./InventoryProvider";

const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 30;

const documentSchema = z.object({
  document: z.object({
    kind: z.enum(["receipt", "invoice", "order", "quote", "other"]),
    store: z.string().max(80).nullable().optional(),
    date: z.string().max(10).nullable().optional(),
    lines: z
      .array(
        z.object({
          text: z.string().max(200),
          brand: z.string().max(80).nullable().optional(),
          model: z.string().max(120).nullable().optional(),
          quantity: z.number().nullable().optional(),
          unitUsd: z.number().nullable().optional(),
          lineId: z.string().max(80).nullable().optional(),
          confidence: z.enum(["high", "medium", "low"]),
        }),
      )
      .max(60),
  }),
});
const errorSchema = z.object({ error: z.string().max(300) });

type ReadLine = z.infer<typeof documentSchema>["document"]["lines"][number];
type Found = {
  key: string;
  file: File;
  state: "waiting" | "reading" | "read" | "failed";
  error: string;
  kind: string;
  store: string | null;
  date: string | null;
  lines: ReadLine[];
  chosen: Record<number, string>;
  applied: number[];
  savedPath: string | null;
};

const KIND_LABELS: Record<string, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  order: "Order confirmation",
  quote: "Quote",
  other: "Document",
};

function yearsSince(date: string | null) {
  if (!date) return null;
  const then = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(then) || then > Date.now()) return null;
  return Math.round(((Date.now() - then) / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
}

function linesOf(inventory: HomeInventory) {
  return inventory.rooms.flatMap((room) =>
    room.items.map((item) => ({ roomId: room.id, room: room.title, item })),
  );
}

function extension(file: File) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function Connections() {
  const params = useSearchParams();
  const { inventories, selected, selectInventory, loadInventory, applyEvidence, saveMedia } = useInventory();
  const saved = inventories.filter((inventory) => inventory.savedVersion !== 0 || inventory.clips.length > 0);
  const wanted = params.get("inventory");
  const [inventoryId, setInventoryId] = useState<string>("");
  const [found, setFound] = useState<Found[]>([]);
  const [notice, setNotice] = useState("");
  const runningRef = useRef(false);
  const foundRef = useRef<Found[]>([]);
  foundRef.current = found;

  useEffect(() => {
    if (inventoryId) return;
    const pick = saved.find((inventory) => inventory.id === wanted) ?? selected ?? saved[0];
    if (pick) setInventoryId(pick.id);
  }, [inventoryId, saved, selected, wanted]);

  const inventory = saved.find((entry) => entry.id === inventoryId) ?? null;

  useEffect(() => {
    if (inventory && !inventory.loaded) void loadInventory(inventory.id);
  }, [inventory, loadInventory]);

  const lines = useMemo(() => (inventory?.loaded ? linesOf(inventory) : []), [inventory]);
  const lineById = useMemo(() => new Map(lines.map((line) => [line.item.id, line])), [lines]);
  const [folderSupported, setFolderSupported] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setFolderSupported(!coarse && "webkitdirectory" in HTMLInputElement.prototype);
  }, []);
  const verified = lines.filter((line) => receiptVerified(line.item)).length;

  function patchFound(key: string, change: (entry: Found) => Found) {
    setFound((current) => current.map((entry) => (entry.key === key ? change(entry) : entry)));
  }

  async function readNext() {
    if (runningRef.current || !inventory) return;
    runningRef.current = true;
    try {
      for (;;) {
        const next = foundRef.current.find((entry) => entry.state === "waiting");
        if (!next) break;
        patchFound(next.key, (entry) => ({ ...entry, state: "reading" }));
        foundRef.current = foundRef.current.map((entry) => (entry.key === next.key ? { ...entry, state: "reading" } : entry));
        const body = new FormData();
        body.set("file", next.file);
        body.set("inventoryId", inventory.id);
        body.set(
          "lines",
          JSON.stringify(
            linesOf(inventory)
              .slice(0, 200)
              .map(({ room, item }) => ({
                id: item.id,
                room: room.slice(0, 80),
                name: item.name.slice(0, 120),
                brand: item.brand?.slice(0, 80) ?? null,
                markings: item.markings?.slice(0, 120) ?? null,
                count: item.count,
              })),
          ),
        );
        try {
          const response = await fetch("/api/connections/receipt", { method: "POST", body });
          const payload: unknown = await response.json().catch(() => null);
          const parsed = documentSchema.safeParse(payload);
          if (!response.ok || !parsed.success) {
            const failure = errorSchema.safeParse(payload);
            patchFound(next.key, (entry) => ({
              ...entry,
              state: "failed",
              error: failure.success ? failure.data.error : "That file did not come back.",
            }));
            if (response.status === 429) break;
            continue;
          }
          const document = parsed.data.document;
          patchFound(next.key, (entry) => ({
            ...entry,
            state: "read",
            kind: document.kind,
            store: document.store ?? null,
            date: document.date ?? null,
            lines: document.lines,
          }));
        } catch {
          patchFound(next.key, (entry) => ({ ...entry, state: "failed", error: "That file did not upload. Check the connection." }));
        }
      }
    } finally {
      runningRef.current = false;
    }
  }

  function addFiles(list: FileList | null) {
    if (!list || !inventory) return;
    const files = [...list].filter((file) => TYPES.includes(file.type) && file.size > 0 && file.size <= MAX_BYTES);
    const skipped = list.length - files.length;
    const room = MAX_FILES - foundRef.current.length;
    const taken = files.slice(0, Math.max(0, room));
    setNotice(
      [
        skipped > 0 ? `${skipped} ${skipped === 1 ? "file was" : "files were"} not an image or PDF under 8 MB.` : "",
        files.length > taken.length ? `Only ${MAX_FILES} files are read at a time.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (taken.length === 0) return;
    const added: Found[] = taken.map((file) => ({
      key: crypto.randomUUID(),
      file,
      state: "waiting",
      error: "",
      kind: "",
      store: null,
      date: null,
      lines: [],
      chosen: {},
      applied: [],
      savedPath: null,
    }));
    foundRef.current = [...foundRef.current, ...added];
    setFound(foundRef.current);
    void readNext();
  }

  async function apply(entry: Found, index: number) {
    if (!inventory) return;
    const line = entry.lines[index];
    const lineId = entry.chosen[index] ?? line?.lineId ?? null;
    const target = lineId ? lineById.get(lineId) : null;
    if (!line || line.unitUsd == null || !target) return;
    const path = entry.savedPath ?? (await saveMedia(inventory.id, `${target.item.id}-receipt-${crypto.randomUUID().slice(0, 8)}.${extension(entry.file)}`, entry.file));
    if (!path) {
      patchFound(entry.key, (current) => ({ ...current, error: "The file could not be kept with this inventory. Try again." }));
      return;
    }
    const patch: ItemPatch = { userValueUsd: line.unitUsd };
    const age = yearsSince(entry.date);
    if (age != null) patch.ageYears = age;
    const pickedByModel = entry.chosen[index] == null;
    if (pickedByModel && line.confidence === "high" && (line.brand || line.model)) {
      if (line.brand && !target.item.brand) patch.brand = line.brand;
      if (line.model) patch.markings = line.model;
      patch.identitySettled = true;
    }
    applyEvidence(inventory.id, target.roomId, target.item.id, patch, "receipt photo", path);
    patchFound(entry.key, (current) => ({ ...current, savedPath: path, applied: [...current.applied, index], error: "" }));
  }

  return (
    <div className="narrow connections">
      <h1 className="inventory-title">Connections</h1>
      <p className="lead connections-lead">
        Receipts, invoices, and quotes show what you paid. When one matches a line, that line is marked receipt verified, the
        strongest evidence an inventory can carry.
      </p>

      {saved.length === 0 ? (
        <section className="sheet">
          <p className="hint">Scan a home first. Receipts are matched to the lines of an inventory.</p>
          <Link className="button brand" href="/scan">
            New scan
          </Link>
        </section>
      ) : (
        <>
          {saved.length > 1 ? (
            <label className="field connections-pick">
              <span>Inventory</span>
              <select
                value={inventoryId}
                onChange={(event) => {
                  setInventoryId(event.target.value);
                  selectInventory(event.target.value);
                  setFound([]);
                  foundRef.current = [];
                }}
              >
                {saved.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {inventoryLabel(entry)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {inventory?.loaded ? (
            <p className="hint">
              {lines.length} {lines.length === 1 ? "line" : "lines"} · {verified} receipt verified
            </p>
          ) : (
            <p className="hint">Opening this inventory.</p>
          )}

          <ul className="source-list">
            <li className="source">
              <div className="source-copy">
                <p className="source-name">Files on this device</p>
                <p className="source-note">
                  Photos or PDFs of receipts, invoices, order emails saved as PDF, and quotes. Read one at a time. Nothing is
                  kept unless you apply a match.
                </p>
              </div>
              <div className="source-actions">
                <label className="button brand source-pick">
                  Choose files
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    disabled={!inventory?.loaded || lines.length === 0}
                    onChange={(event) => {
                      addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                {folderSupported ? (
                  <label className="button quiet source-pick">
                    Choose a folder
                    <input
                      type="file"
                      multiple
                      disabled={!inventory?.loaded || lines.length === 0}
                      ref={(node) => {
                        if (node) node.setAttribute("webkitdirectory", "");
                      }}
                      onChange={(event) => {
                        addFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
            </li>
            <li className="source is-planned">
              <div className="source-copy">
                <p className="source-name">
                  Email <span className="source-tag">Planned</span>
                </p>
                <p className="source-note">
                  Search Gmail or Outlook for order confirmations, read-only. You choose which messages are read. Until then,
                  save an order email as a PDF and add it as a file.
                </p>
              </div>
            </li>
            <li className="source is-planned">
              <div className="source-copy">
                <p className="source-name">
                  Assistant tools (MCP) <span className="source-tag">Planned</span>
                </p>
                <p className="source-note">
                  Let a desktop assistant look through folders you allow and send back receipts it finds. Each match still waits
                  for you to apply it.
                </p>
              </div>
            </li>
          </ul>

          {notice ? <p className="hint">{notice}</p> : null}

          {found.length > 0 ? (
            <section className="found" aria-label="Files read">
              <p className="total-label">Files</p>
              <ul className="found-list">
                {found.map((entry) => {
                  const priced = entry.lines.map((line, index) => ({ line, index })).filter(({ line }) => line.unitUsd != null);
                  const matched = priced.filter(({ line, index }) => (entry.chosen[index] ?? line.lineId) != null);
                  const loose = priced.filter(({ line, index }) => (entry.chosen[index] ?? line.lineId) == null);
                  return (
                    <li key={entry.key} className="found-file">
                      <p className="found-head">
                        <span className="found-name">{entry.file.name}</span>
                        <span className="found-state">
                          {entry.state === "waiting"
                            ? "Waiting"
                            : entry.state === "reading"
                              ? "Reading"
                              : entry.state === "failed"
                                ? "Not read"
                                : [KIND_LABELS[entry.kind] ?? "Document", entry.store, entry.date].filter(Boolean).join(" · ")}
                        </span>
                      </p>
                      {entry.state === "reading" ? <span className="found-progress" aria-hidden="true" /> : null}
                      {entry.error ? <p className="form-error">{entry.error}</p> : null}
                      {entry.state === "read" && priced.length === 0 ? <p className="hint">No priced lines were found on this file.</p> : null}
                      {matched.length > 0 ? (
                        <ul className="match-list">
                          {matched.map(({ line, index }) => {
                            const target = lineById.get(entry.chosen[index] ?? line.lineId ?? "");
                            const done = entry.applied.includes(index);
                            return (
                              <li key={index} className="match">
                                <p className="match-copy">
                                  <span className="match-line">
                                    {target ? `${target.item.name} · ${target.room}` : "A line that was removed"}
                                  </span>
                                  <span className="match-text">
                                    “{line.text}” · {formatMoney(line.unitUsd ?? 0)}
                                    {entry.chosen[index] ? " · matched by you" : line.confidence === "high" ? " · brand or model matches" : " · kind and price fit"}
                                  </span>
                                </p>
                                {done ? (
                                  <span className="match-done">Receipt verified</span>
                                ) : target ? (
                                  <button type="button" className="button quiet" onClick={() => void apply(entry, index)}>
                                    Apply
                                  </button>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {loose.length > 0 ? (
                        <details className="match-loose">
                          <summary>
                            {loose.length} priced {loose.length === 1 ? "line" : "lines"} not matched
                          </summary>
                          <ul className="match-list">
                            {loose.map(({ line, index }) => (
                              <li key={index} className="match">
                                <p className="match-copy">
                                  <span className="match-text">
                                    “{line.text}” · {formatMoney(line.unitUsd ?? 0)}
                                  </span>
                                </p>
                                <select
                                  aria-label="Match to a line"
                                  value=""
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    if (value) patchFound(entry.key, (current) => ({ ...current, chosen: { ...current.chosen, [index]: value } }));
                                  }}
                                >
                                  <option value="">Match to…</option>
                                  {lines.map(({ room, item }) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name} · {room}
                                    </option>
                                  ))}
                                </select>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {inventory ? (
                <Link className="button quiet" href="/inventory">
                  Back to the inventory
                </Link>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
