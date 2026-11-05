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
import { applyPatch, mergeRooms, moveClipLines, withChange, type ItemPatch, type ReviewMode } from "../lib/inventory-merge";
import { roomMarkersSchema, roomQuestionSchema, withMarker, type RoomMarker, type RoomQuestion } from "../lib/scan-rooms";
import { repeatQuestionSchema, sameObjectCheckSchema, type RepeatQuestion, type SameObjectVerdict } from "../lib/repeat-match";
import { joinRepeatPair } from "../lib/scan-pipeline";
import { identityCheckSchema, type IdentityCheck } from "../lib/identity-check";
import { resolveIdentity, withIdentityCheck } from "../lib/read-twice";
import { walkCompareSchema, type WalkCompare } from "../lib/walk-compare";
import { scanStatsSchema, type ScanStats } from "../lib/scan-stats";
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
  street: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  county: z.string().trim().max(80).optional(),
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
  processingIds: string[];
  markProcessing: (id: string, on: boolean) => void;
  listReady: boolean;
  deleteInventory: (id: string) => Promise<boolean>;
  startInventory: () => void;
  selectInventory: (id: string) => void;
  loadInventory: (id: string) => Promise<boolean>;
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
  updateClip: (inventoryId: string, clipId: string, patch: Partial<Pick<ScanClip, "storagePath" | "posterPath" | "rooms">>) => void;
  /** Room-change questions the scan saved without an answer. Repeats for the same clip are ignored. */
  addRoomQuestions: (inventoryId: string, questions: RoomQuestion[]) => void;
  /** Yes moves that clip's later lines to the room; no keeps them. Returns how many lines moved. */
  answerRoomQuestion: (inventoryId: string, questionId: string, move: boolean) => number;
  /** Possible repeats the check at Done did not merge. A repeat of the same pair is ignored. */
  addRepeatQuestions: (inventoryId: string, questions: RepeatQuestion[]) => void;
  /** Same item merges the two lines into one; two items keeps both. Returns whether they were merged. */
  answerRepeatQuestion: (inventoryId: string, questionId: string, merge: boolean) => boolean;
  /** Muse Spark 1.3's photo comparison for a waiting question. Advice only. */
  setRepeatCheck: (inventoryId: string, questionId: string, check: SameObjectVerdict) => void;
  /** A sure repeat found after a save, such as a Scan more line that matches a saved one. */
  joinLines: (inventoryId: string, aId: string, bId: string) => void;
  /** Two identity reads that came back after the scan was saved. */
  setIdentityCheck: (inventoryId: string, itemId: string, check: IdentityCheck) => void;
  /** The owner's pick on a line whose two reads disagree. */
  resolveIdentityCheck: (inventoryId: string, itemId: string, pick: "a" | "b" | "neither") => void;
  /** A Scan more walk compared with the saved lines. The latest one replaces the last. */
  setWalkCompare: (inventoryId: string, compare: WalkCompare) => void;
  /** One scan's research counts. A later save of the same scan replaces its earlier counts. */
  saveScanStats: (inventoryId: string, stats: ScanStats) => void;
  addItem: (item: EnteredItem) => void;
  /** Upload to the private bucket. Returns the storage path, or null when it did not save. */
  saveMedia: (inventoryId: string, name: string, blob: Blob) => Promise<string | null>;
  /** Pictures already saved for this inventory, with a link that expires in an hour. */
  listMedia: (inventoryId: string) => Promise<{ path: string; name: string; url: string | null }[]>;
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
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [listReady, setListReady] = useState(false);
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
  const retryAfterSaveRef = useRef(false);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const loadingRef = useRef(new Map<string, Promise<boolean>>());
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
    try {
      const collected: z.infer<typeof listResponseSchema>["inventories"] = [];
      let cursor: { before: string; beforeId: string } | null = null;
      let orgId = "";
      for (let page = 0; page < 10; page += 1) {
        const query = cursor ? `?before=${encodeURIComponent(cursor.before)}&beforeId=${cursor.beforeId}` : "";
        const response = await fetch(`/api/inventories${query}`, { cache: "no-store" });
        if (!response.ok) return;
        const parsed = listResponseSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) return;
        orgId = parsed.data.orgId;
        collected.push(...parsed.data.inventories);
        if (!parsed.data.next) break;
        cursor = parsed.data.next;
      }
      orgIdRef.current = orgId;
      const serverIds = new Set(collected.map((entry) => entry.id));
      setInventories((current) => {
        const locals = current.filter((inventory) => inventory.savedVersion === 0 && !serverIds.has(inventory.id));
        const fromServer = collected.map((entry) => {
          const existing = current.find((inventory) => inventory.id === entry.id);
          if (!existing) return fromListEntry(entry);
          return { ...existing, title: existing.title || entry.title, coverUrl: entry.coverUrl || existing.coverUrl, sealedAt: entry.sealedAt };
        });
        return [...locals, ...fromServer];
      });
    } finally {
      setListReady(true);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const flush = useCallback(async () => {
    if (savingRef.current) {
      // A change landed while a save was in flight. It is saved once that save returns, not dropped.
      retryAfterSaveRef.current = true;
      return;
    }
    savingRef.current = true;
    retryAfterSaveRef.current = false;
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
      if (retryAfterSaveRef.current && dirtyRef.current.size > 0) {
        retryAfterSaveRef.current = false;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => void flushRef.current?.(), 300);
      }
    }
  }, []);
  flushRef.current = flush;

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
      processingIds,
      listReady,
      deleteInventory: async (id) => {
        dirtyRef.current.delete(id);
        pendingEventsRef.current.delete(id);
        const response = await fetch(`/api/inventories/${id}`, { method: "DELETE" });
        if (!response.ok) return false;
        setInventories((current) => current.filter((inventory) => inventory.id !== id));
        setSelectedId((current) => (current === id ? null : current));
        setProcessingIds((current) => current.filter((entry) => entry !== id));
        return true;
      },
      markProcessing: (id, on) => {
        setProcessingIds((current) => (on ? (current.includes(id) ? current : [...current, id]) : current.filter((entry) => entry !== id)));
      },
      startInventory: () => {
        const id = crypto.randomUUID();
        setInventories((current) => {
          const number = current.reduce((max, inventory) => Math.max(max, inventory.number), 0) + 1;
          return [...current, blankInventory(id, number)];
        });
        setSelectedId(id);
      },
      selectInventory: (id) => setSelectedId(id),
      loadInventory: (id) => {
        const existing = inventoriesRef.current.find((inventory) => inventory.id === id);
        if (existing?.loaded) return Promise.resolve(true);
        const pending = loadingRef.current.get(id);
        if (pending) return pending;
        const job = (async () => {
          try {
            const response = await fetch(`/api/inventories/${id}`, { cache: "no-store" });
            if (!response.ok) return false;
            const loaded = fromLoaded(await response.json().catch(() => null));
            if (!loaded) return false;
            for (const room of loaded.rooms) for (const item of room.items) for (const entry of item.changes) loggedRef.current.add(entry.id);
            setInventories((current) => current.map((inventory) => (inventory.id === id ? loaded : inventory)));
            return true;
          } catch {
            return false;
          } finally {
            loadingRef.current.delete(id);
          }
        })();
        loadingRef.current.set(id, job);
        return job;
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
        if (patch.rooms && !roomMarkersSchema.safeParse(patch.rooms).success) return;
        update(inventoryId, (inventory) => ({
          ...inventory,
          clips: inventory.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
        }));
      },
      addRoomQuestions: (inventoryId, questions) => {
        const parsed = z.array(roomQuestionSchema).max(40).safeParse(questions);
        if (!parsed.success || parsed.data.length === 0) return;
        update(inventoryId, (inventory) => {
          const waiting = inventory.roomQuestions ?? [];
          const asked = new Set(waiting.map((question) => question.clipId));
          return { ...inventory, roomQuestions: [...waiting, ...parsed.data.filter((question) => !asked.has(question.clipId))].slice(-40) };
        });
      },
      answerRoomQuestion: (inventoryId, questionId, move) => {
        const inventory = inventories.find((entry) => entry.id === inventoryId);
        const question = inventory?.roomQuestions?.find((entry) => entry.id === questionId);
        if (!inventory || !question) return 0;
        const result = move ? moveClipLines({ rooms: inventory.rooms }, question.clipId, question.atSec, question.tapped, question.room) : null;
        for (const itemId of result?.ids ?? []) {
          queueEvent(inventoryId, {
            id: crypto.randomUUID(),
            itemId,
            kind: "edit",
            evidence: { source: "room prompt", clip: question.clip },
            before: { room: question.tapped.slice(0, 80) },
            after: { room: question.room.slice(0, 80) },
          });
        }
        update(inventoryId, (current) => {
          const rest = (current.roomQuestions ?? []).filter((entry) => entry.id !== questionId);
          if (!move) return { ...current, roomQuestions: rest };
          const moved = moveClipLines({ rooms: current.rooms }, question.clipId, question.atSec, question.tapped, question.room);
          const marked = (markers: RoomMarker[] | undefined) => withMarker(markers ?? [], Math.round(question.atSec * 1000), question.room);
          return {
            ...current,
            rooms: moved.review.rooms,
            clips: current.clips.map((clip) => (clip.id === question.clipId ? { ...clip, rooms: marked(clip.rooms) } : clip)),
            roomQuestions: rest,
          };
        });
        return result?.moved ?? 0;
      },
      addRepeatQuestions: (inventoryId, questions) => {
        const parsed = z.array(repeatQuestionSchema).max(40).safeParse(questions);
        if (!parsed.success || parsed.data.length === 0) return;
        const key = (question: RepeatQuestion) => [question.aId, question.bId].sort().join("|");
        update(inventoryId, (inventory) => {
          const waiting = inventory.repeatQuestions ?? [];
          const asked = new Set(waiting.map(key));
          return { ...inventory, repeatQuestions: [...waiting, ...parsed.data.filter((question) => !asked.has(key(question)))].slice(-40) };
        });
      },
      answerRepeatQuestion: (inventoryId, questionId, merge) => {
        const inventory = inventories.find((entry) => entry.id === inventoryId);
        const question = inventory?.repeatQuestions?.find((entry) => entry.id === questionId);
        if (!inventory || !question) return false;
        const result = merge ? joinRepeatPair({ rooms: inventory.rooms }, question.aId, question.bId) : null;
        const goneId = result?.joined ? (result.keptId === question.aId ? question.bId : question.aId) : null;
        if (result?.joined && result.keptId && goneId) {
          queueEvent(inventoryId, {
            id: crypto.randomUUID(),
            itemId: result.keptId,
            kind: "edit",
            evidence: { source: "repeat question" },
            before: { sameObjectAs: (goneId === question.aId ? question.aName : question.bName).slice(0, 400) },
            after: { rooms: `${question.aRoom}, ${question.bRoom}`.slice(0, 400) },
          });
        }
        update(inventoryId, (current) => {
          const rest = (current.repeatQuestions ?? []).filter(
            (entry) => entry.id !== questionId && (!goneId || (entry.aId !== goneId && entry.bId !== goneId)),
          );
          if (!merge) return { ...current, repeatQuestions: rest };
          const joined = joinRepeatPair({ rooms: current.rooms }, question.aId, question.bId);
          return { ...current, rooms: joined.review.rooms, repeatQuestions: rest };
        });
        return result?.joined ?? false;
      },
      setRepeatCheck: (inventoryId, questionId, check) => {
        const parsed = sameObjectCheckSchema.safeParse(check);
        if (!parsed.success) return;
        update(inventoryId, (inventory) => ({
          ...inventory,
          repeatQuestions: (inventory.repeatQuestions ?? []).map((question) => (question.id === questionId ? { ...question, check: parsed.data } : question)),
        }));
      },
      setIdentityCheck: (inventoryId, itemId, check) => {
        const parsed = identityCheckSchema.safeParse(check);
        if (!parsed.success) return;
        update(inventoryId, (inventory) => ({
          ...inventory,
          rooms: inventory.rooms.map((room) => ({
            ...room,
            items: room.items.map((item) => (item.id === itemId ? withIdentityCheck(item, parsed.data) : item)),
          })),
        }));
      },
      resolveIdentityCheck: (inventoryId, itemId, pick) => {
        queueEvent(inventoryId, {
          id: crypto.randomUUID(),
          itemId,
          kind: "edit",
          evidence: { source: "read twice", pick },
          before: null,
          after: null,
        });
        update(inventoryId, (inventory) => ({
          ...inventory,
          rooms: inventory.rooms.map((room) => ({
            ...room,
            items: room.items.map((item) => (item.id === itemId ? resolveIdentity(item, pick) : item)),
          })),
        }));
      },
      saveScanStats: (inventoryId, stats) => {
        const parsed = scanStatsSchema.safeParse(stats);
        if (!parsed.success) return;
        update(inventoryId, (inventory) => {
          const others = (inventory.scanStats ?? []).filter((entry) => entry.scanId !== parsed.data.scanId);
          return { ...inventory, scanStats: [...others, parsed.data].slice(-20) };
        });
      },
      setWalkCompare: (inventoryId, compare) => {
        const parsed = walkCompareSchema.safeParse(compare);
        if (!parsed.success) return;
        update(inventoryId, (inventory) => ({ ...inventory, walkCompare: parsed.data }));
      },
      joinLines: (inventoryId, aId, bId) => {
        update(inventoryId, (inventory) => {
          const joined = joinRepeatPair({ rooms: inventory.rooms }, aId, bId);
          if (!joined.joined) return inventory;
          const gone = joined.keptId === aId ? bId : aId;
          return {
            ...inventory,
            rooms: joined.review.rooms,
            repeatQuestions: (inventory.repeatQuestions ?? []).filter((question) => question.aId !== gone && question.bId !== gone),
          };
        });
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
      listMedia: async (inventoryId) => {
        if (!orgIdRef.current) await fetchList();
        const orgId = orgIdRef.current;
        if (!orgId) return [];
        try {
          supabaseRef.current ??= createBrowserSupabase();
          const bucket = supabaseRef.current.storage.from("evidence");
          const folder = `${orgId}/${inventoryId}`;
          const { data, error } = await bucket.list(folder, { limit: 1000 });
          if (error || !data) return [];
          const names = data.map((entry) => entry.name).filter((name) => /\.(jpe?g|png)$/i.test(name));
          if (names.length === 0) return [];
          const paths = names.map((name) => `${folder}/${name}`);
          const { data: signed } = await bucket.createSignedUrls(paths, 3600);
          return names.map((name, index) => ({ name, path: paths[index]!, url: signed?.[index]?.signedUrl ?? null }));
        } catch {
          return [];
        }
      },
    };
  }, [inventories, selectedId, saveState, processingIds, listReady, markDirty, queueEvent, fetchList]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const value = useContext(InventoryContext);
  if (!value) {
    throw new Error("useInventory must be used inside InventoryProvider");
  }
  return value;
}
