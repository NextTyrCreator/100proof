"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { ADDRESS_REGION_IDS } from "../lib/address-search";
import {
  type AddressPoint,
  type ChangeSource,
  type EnteredItem,
  type EvidenceKind,
  type HomeInventory,
  type RoomItem,
  type SaidFact,
  type ScanClip,
  type ScanPlace,
} from "../lib/inventory";
import { applyPatch, mergeRooms, withChange, type ItemPatch, type ReviewMode } from "../lib/inventory-merge";
import type { ItemEvent } from "../lib/inventory-record";
import { fromListEntry, fromLoaded, listResponseSchema, savable, toSaveRequest } from "../lib/inventory-sync";
import { reviewItemSchema, reviewResultSchema, type ReviewResult } from "../lib/review-shape";
import { createBrowserSupabase } from "../lib/supabase/browser";

const titleSchema = z.string().max(80);
const addressSchema = z.string().max(300);
const regionSchema = z.enum(ADDRESS_REGION_IDS);
const addressPointSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  label: z.string().trim().min(1).max(300),
});
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const scanPlaceSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracyMeters: z.number().finite().nonnegative().max(100_000),
  capturedAt: z.string().min(1).max(40),
});

type SaveState = "idle" | "saving" | "saved" | "failed";

type InventoryContextValue = {
  inventories: HomeInventory[];
  selected: HomeInventory | null;
  saveState: SaveState;
  startInventory: () => void;
  selectInventory: (id: string) => void;
  loadInventory: (id: string) => Promise<void>;
  setInventoryTitle: (id: string, title: string) => void;
  setAddressRegion: (id: string, regionId: string) => void;
  setHomeAddress: (id: string, address: string) => void;
  setAddressPoint: (id: string, point: AddressPoint | null) => void;
  pinAddress: (id: string, point: AddressPoint) => void;
  setScanPlace: (id: string, place: ScanPlace) => void;
  sealRecord: (id: string, hash: string, sealedAt: string) => void;
  setScanReview: (id: string, review: ReviewResult, mode?: ReviewMode, focusIds?: string[]) => void;
  addRoomItem: (inventoryId: string, item: RoomItem) => void;
  renameRoom: (inventoryId: string, roomId: string, title: string) => void;
  deleteRoomItem: (inventoryId: string, roomId: string, itemId: string) => void;
  updateRoomItem: (inventoryId: string, roomId: string, itemId: string, patch: ItemPatch) => void;
  applyEvidence: (
    inventoryId: string,
    roomId: string,
    itemId: string,
    patch: ItemPatch,
    source: ChangeSource,
    evidenceRef: string | null,
    said?: SaidFact,
  ) => void;
  skipRequest: (inventoryId: string, roomId: string, itemId: string, kind: EvidenceKind) => void;
  addClip: (clip: Omit<ScanClip, "sourceKept">) => void;
  updateClip: (inventoryId: string, clipId: string, patch: Partial<Pick<ScanClip, "storagePath" | "posterPath">>) => void;
  addItem: (item: EnteredItem) => void;
  /** Upload to the private bucket. Returns the storage path, or null when it did not save. */
  saveMedia: (inventoryId: string, name: string, blob: Blob) => Promise<string | null>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

function blankInventory(id: string, number: number): HomeInventory {
  return {
    id,
    number,
    title: "",
    homeAddress: "",
    addressRegion: "",
    addressPoint: null,
    place: null,
    locationCheck: null,
    recordHash: null,
    sealedAt: null,
    rooms: [],
    clips: [],
    items: [],
    savedVersion: 0,
    loaded: true,
    createdAt: new Date().toISOString(),
    coverUrl: "",
  };
}

function eventKind(source: ChangeSource): ItemEvent["kind"] {
  if (source === "clip") return "clip";
  if (source === "your answer") return "answer";
  if (source === "your edit" || source === "check") return "edit";
  return "photo";
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  // A draft exists on the first paint so a refresh shows the title and country form.
  const [inventories, setInventories] = useState<HomeInventory[]>(() => [blankInventory(crypto.randomUUID(), 1)]);
  const [selectedId, setSelectedId] = useState<string | null>(() => inventories[0]?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const inventoriesRef = useRef(inventories);
  inventoriesRef.current = inventories;
  const orgIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(new Set<string>());
  const loggedRef = useRef(new Set<string>());
  const pendingEventsRef = useRef(new Map<string, ItemEvent[]>());
  const savingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabase> | null>(null);

  const markDirty = useCallback((id: string) => {
    dirtyRef.current.add(id);
  }, []);

  const queueEvent = useCallback((inventoryId: string, event: ItemEvent) => {
    const list = pendingEventsRef.current.get(inventoryId) ?? [];
    list.push(event);
    pendingEventsRef.current.set(inventoryId, list);
  }, []);

  const fetchList = useCallback(async () => {
    const response = await fetch("/api/inventories", { cache: "no-store" });
    if (!response.ok) return;
    const parsed = listResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return;
    orgIdRef.current = parsed.data.orgId;
    setInventories((current) => {
      const known = new Set(current.map((inventory) => inventory.id));
      const fresh = parsed.data.inventories.filter((entry) => !known.has(entry.id)).map(fromListEntry);
      if (fresh.length === 0) return current;
      const savedTop = fresh.reduce((max, inventory) => Math.max(max, inventory.number), 0);
      return [...current, ...fresh].map((inventory) =>
        inventory.savedVersion === 0 && inventory.clips.length === 0 && inventory.number <= savedTop
          ? { ...inventory, number: savedTop + 1 }
          : inventory,
      );
    });
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const flush = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      for (const id of [...dirtyRef.current]) {
        const inventory = inventoriesRef.current.find((entry) => entry.id === id);
        if (!inventory || !savable(inventory)) {
          dirtyRef.current.delete(id);
          continue;
        }
        const fromChanges: ItemEvent[] = inventory.rooms.flatMap((room) =>
          room.items.flatMap((item) =>
            item.changes
              .filter((entry) => !loggedRef.current.has(entry.id))
              .map((entry) => ({
                id: entry.id,
                itemId: item.id,
                kind: eventKind(entry.source),
                evidence: { source: entry.source, ref: entry.evidenceRef, at: entry.at },
                before: entry.before,
                after: entry.after,
              })),
          ),
        );
        const queued = pendingEventsRef.current.get(id) ?? [];
        const events = [...queued, ...fromChanges].slice(0, 200);
        const body = toSaveRequest(inventory, events);
        if (!body) {
          dirtyRef.current.delete(id);
          setSaveState("failed");
          continue;
        }
        dirtyRef.current.delete(id);
        setSaveState("saving");
        const response = await fetch(`/api/inventories/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => null)) as { version?: number; orgId?: string; eventsSaved?: boolean } | null;
        if (!response.ok || typeof payload?.version !== "number") {
          dirtyRef.current.add(id);
          setSaveState("failed");
          continue;
        }
        if (payload.orgId) orgIdRef.current = payload.orgId;
        if (payload.eventsSaved !== false) {
          for (const event of events) loggedRef.current.add(event.id);
          pendingEventsRef.current.set(
            id,
            (pendingEventsRef.current.get(id) ?? []).filter((event) => !events.includes(event)),
          );
        }
        const version = payload.version;
        setInventories((current) => current.map((entry) => (entry.id === id ? { ...entry, savedVersion: version } : entry)));
        setSaveState("saved");
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (dirtyRef.current.size === 0) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void flush(), 900);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [inventories, flush]);

  const value = useMemo<InventoryContextValue>(() => {
    const selected = inventories.find((inventory) => inventory.id === selectedId) ?? null;

    function update(id: string, change: (inventory: HomeInventory) => HomeInventory) {
      markDirty(id);
      setInventories((current) => current.map((inventory) => (inventory.id === id ? change(inventory) : inventory)));
    }

    function updateItem(inventoryId: string, roomId: string, itemId: string, change: (item: RoomItem) => RoomItem | null) {
      update(inventoryId, (inventory) => ({
        ...inventory,
        rooms: inventory.rooms.map((room) =>
          room.id === roomId
            ? { ...room, items: room.items.map((item) => (item.id === itemId ? (change(item) ?? item) : item)) }
            : room,
        ),
      }));
    }

    return {
      inventories,
      selected,
      saveState,
      startInventory: () => {
        const id = crypto.randomUUID();
        setInventories((current) => {
          const number = current.reduce((max, inventory) => Math.max(max, inventory.number), 0) + 1;
          return [...current, blankInventory(id, number)];
        });
        setSelectedId(id);
      },
      selectInventory: (id) => setSelectedId(id),
      loadInventory: async (id) => {
        const existing = inventoriesRef.current.find((inventory) => inventory.id === id);
        if (existing?.loaded) return;
        const response = await fetch(`/api/inventories/${id}`, { cache: "no-store" });
        if (!response.ok) return;
        const loaded = fromLoaded(await response.json().catch(() => null));
        if (!loaded) return;
        for (const room of loaded.rooms) for (const item of room.items) for (const entry of item.changes) loggedRef.current.add(entry.id);
        setInventories((current) => current.map((inventory) => (inventory.id === id ? loaded : inventory)));
      },
      setInventoryTitle: (id, title) => {
        const parsed = titleSchema.safeParse(title);
        if (!parsed.success) return;
        update(id, (inventory) => ({ ...inventory, title: parsed.data }));
      },
      setAddressRegion: (id, regionId) => {
        if (regionId === "") {
          update(id, (inventory) => ({ ...inventory, addressRegion: "", addressPoint: null }));
          return;
        }
        const parsed = regionSchema.safeParse(regionId);
        if (!parsed.success) return;
        update(id, (inventory) => ({
          ...inventory,
          addressRegion: parsed.data,
          addressPoint: inventory.addressRegion === parsed.data ? inventory.addressPoint : null,
        }));
      },
      setHomeAddress: (id, address) => {
        const parsed = addressSchema.safeParse(address);
        if (!parsed.success) return;
        update(id, (inventory) => ({
          ...inventory,
          homeAddress: parsed.data,
          addressPoint:
            inventory.addressPoint && inventory.addressPoint.label !== parsed.data.trim() ? null : inventory.addressPoint,
        }));
      },
      setAddressPoint: (id, point) => {
        if (point === null) {
          update(id, (inventory) => ({ ...inventory, addressPoint: null }));
          return;
        }
        const parsed = addressPointSchema.safeParse(point);
        if (!parsed.success) return;
        update(id, (inventory) => ({ ...inventory, addressPoint: parsed.data, homeAddress: parsed.data.label }));
      },
      pinAddress: (id, point) => {
        const parsed = addressPointSchema.safeParse(point);
        if (!parsed.success) return;
        update(id, (inventory) => ({ ...inventory, addressPoint: parsed.data }));
      },
      setScanPlace: (id, place) => {
        const parsed = scanPlaceSchema.safeParse(place);
        if (!parsed.success) return;
        update(id, (inventory) => ({ ...inventory, place: parsed.data }));
      },
      sealRecord: (id, hash, sealedAt) => {
        const parsed = hashSchema.safeParse(hash);
        if (!parsed.success) return;
        update(id, (inventory) => ({ ...inventory, recordHash: parsed.data, sealedAt }));
      },
      setScanReview: (id, review, mode = "replace", focusIds = []) => {
        const parsed = reviewResultSchema.safeParse(review);
        if (!parsed.success) return;
        update(id, (inventory) => ({
          ...inventory,
          rooms: mode === "replace" ? parsed.data.rooms : mergeRooms(inventory.rooms, parsed.data.rooms, mode, focusIds),
        }));
      },
      addRoomItem: (inventoryId, item) => {
        const parsed = reviewItemSchema.safeParse(item);
        if (!parsed.success) return;
        queueEvent(inventoryId, {
          id: crypto.randomUUID(),
          itemId: parsed.data.id,
          kind: "added",
          evidence: { source: "your edit" },
          before: null,
          after: { name: parsed.data.name, count: parsed.data.count },
        });
        update(inventoryId, (inventory) => {
          const existing = inventory.rooms.find((room) => room.title === "Added by you");
          if (!existing) {
            return {
              ...inventory,
              rooms: [...inventory.rooms, { id: crypto.randomUUID(), title: "Added by you", items: [parsed.data] }],
            };
          }
          return {
            ...inventory,
            rooms: inventory.rooms.map((room) => (room.id === existing.id ? { ...room, items: [...room.items, parsed.data] } : room)),
          };
        });
      },
      renameRoom: (inventoryId, roomId, title) => {
        const parsed = titleSchema.safeParse(title);
        if (!parsed.success) return;
        update(inventoryId, (inventory) => ({
          ...inventory,
          rooms: inventory.rooms.map((room) => (room.id === roomId ? { ...room, title: parsed.data } : room)),
        }));
      },
      updateRoomItem: (inventoryId, roomId, itemId, patch) => {
        updateItem(inventoryId, roomId, itemId, (item) => applyPatch(item, patch));
      },
      applyEvidence: (inventoryId, roomId, itemId, patch, source, evidenceRef, said) => {
        updateItem(inventoryId, roomId, itemId, (item) => {
          const next = applyPatch(item, patch);
          if (!next) return null;
          const withSaid = said ? { ...next, said: [...next.said, said].slice(-20) } : next;
          return withChange(item, withSaid, source, evidenceRef);
        });
      },
      skipRequest: (inventoryId, roomId, itemId, kind) => {
        updateItem(inventoryId, roomId, itemId, (item) =>
          item.skipped.includes(kind) ? item : { ...item, skipped: [...item.skipped, kind] },
        );
      },
      deleteRoomItem: (inventoryId, roomId, itemId) => {
        const item = inventoriesRef.current
          .find((inventory) => inventory.id === inventoryId)
          ?.rooms.find((room) => room.id === roomId)
          ?.items.find((entry) => entry.id === itemId);
        if (item) {
          queueEvent(inventoryId, {
            id: crypto.randomUUID(),
            itemId,
            kind: "removed",
            evidence: { source: "your edit" },
            before: { name: item.name.slice(0, 400), count: item.count },
            after: null,
          });
        }
        update(inventoryId, (inventory) => ({
          ...inventory,
          rooms: inventory.rooms.map((room) =>
            room.id === roomId ? { ...room, items: room.items.filter((entry) => entry.id !== itemId) } : room,
          ),
        }));
      },
      addClip: (clip) => {
        const id = selectedIdRef.current;
        if (!id) return;
        update(id, (inventory) => ({
          ...inventory,
          clips: [...inventory.clips, { ...clip, sourceKept: true }],
          coverUrl: inventory.coverUrl || clip.posterUrl,
        }));
      },
      updateClip: (inventoryId, clipId, patch) => {
        update(inventoryId, (inventory) => ({
          ...inventory,
          clips: inventory.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
        }));
      },
      addItem: (item) => {
        const id = selectedIdRef.current;
        if (!id) return;
        update(id, (inventory) => ({ ...inventory, items: [...inventory.items, item] }));
      },
      saveMedia: async (inventoryId, name, blob) => {
        if (!/^[A-Za-z0-9._-]{1,120}$/.test(name)) return null;
        if (!orgIdRef.current) await fetchList();
        const orgId = orgIdRef.current;
        if (!orgId) return null;
        try {
          supabaseRef.current ??= createBrowserSupabase();
          const path = `${orgId}/${inventoryId}/${name}`;
          const { error } = await supabaseRef.current.storage
            .from("evidence")
            .upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false });
          return error ? null : path;
        } catch {
          return null;
        }
      },
    };
  }, [inventories, selectedId, saveState, markDirty, queueEvent, fetchList]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const value = useContext(InventoryContext);
  if (!value) {
    throw new Error("useInventory must be used inside InventoryProvider");
  }
  return value;
}
