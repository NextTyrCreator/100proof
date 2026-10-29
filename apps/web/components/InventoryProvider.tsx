"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { ADDRESS_REGION_IDS } from "../lib/address-search";
import { HIGH_VALUE_OVER_USD, type AddressPoint, type EnteredItem, type HomeInventory, type RoomItem, type RoomShard, type ScanClip, type ScanPlace } from "../lib/inventory";
import { reviewItemSchema, reviewResultSchema, type ReviewResult } from "../lib/review-shape";

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

type InventoryContextValue = {
  inventories: HomeInventory[];
  selected: HomeInventory | null;
  startInventory: () => void;
  selectInventory: (id: string) => void;
  setInventoryTitle: (id: string, title: string) => void;
  setAddressRegion: (id: string, regionId: string) => void;
  setHomeAddress: (id: string, address: string) => void;
  setAddressPoint: (id: string, point: AddressPoint | null) => void;
  pinAddress: (id: string, point: AddressPoint) => void;
  setScanPlace: (id: string, place: ScanPlace) => void;
  sealRecord: (id: string, hash: string, sealedAt: string) => void;
  setScanReview: (id: string, review: ReviewResult, mode?: "replace" | "append" | "continue") => void;
  addRoomItem: (inventoryId: string, item: RoomItem) => void;
  renameRoom: (inventoryId: string, roomId: string, title: string) => void;
  deleteRoomItem: (inventoryId: string, roomId: string, itemId: string) => void;
  updateRoomItem: (
    inventoryId: string,
    roomId: string,
    itemId: string,
    patch: {
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
    },
  ) => void;
  addClip: (clip: Omit<ScanClip, "sourceKept">) => void;
  addItem: (item: EnteredItem) => void;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

function samePiece(existing: RoomItem, item: RoomItem) {
  return (
    existing.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
    (existing.brand ?? "") === (item.brand ?? "") &&
    (existing.markings ?? "") === (item.markings ?? "") &&
    (existing.serial ?? "") === (item.serial ?? "") &&
    (existing.color ?? "") === (item.color ?? "") &&
    (existing.size ?? "") === (item.size ?? "")
  );
}

function groupedMatch(existing: RoomItem, item: RoomItem) {
  return (
    existing.grouped &&
    item.grouped &&
    existing.category === item.category &&
    existing.itemType === item.itemType &&
    existing.brand === item.brand &&
    existing.markings === item.markings &&
    existing.wearer === item.wearer &&
    existing.sizeBand === item.sizeBand
  );
}

function mergeRooms(current: RoomShard[], incoming: RoomShard[], continued: boolean): RoomShard[] {
  const rooms = current.map((room) => ({ ...room, items: room.items.map((item) => ({ ...item })) }));
  for (const next of incoming) {
    const room = rooms.find((entry) => entry.title.trim().toLowerCase() === next.title.trim().toLowerCase());
    if (!room) {
      rooms.push(next);
      continue;
    }
    for (const item of next.items) {
      const match = item.grouped
        ? room.items.find((existing) => groupedMatch(existing, item))
        : continued
          ? room.items.find((existing) => !existing.grouped && samePiece(existing, item))
          : undefined;
      if (match) {
        if (item.grouped) match.count = continued ? Math.max(match.count, item.count) : match.count + item.count;
        continue;
      }
      room.items.push(item);
    }
  }
  return rooms;
}

export function combinePieceReviews(base: ReviewResult, next: ReviewResult): ReviewResult {
  return { rooms: mergeRooms(base.rooms, next.rooms, true) };
}

function money(value: number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return { success: true as const, data: null };
  return z.number().finite().nonnegative().max(1_000_000).safeParse(value);
}

/** Stable across server and client so a refresh paints the blank form, not a dead end. */
const OPENING_DRAFT_ID = "opening-draft";

function blankInventory(id: string, number: number): HomeInventory {
  return {
    id,
    number,
    title: "",
    homeAddress: "",
    addressRegion: "",
    addressPoint: null,
    place: null,
    recordHash: null,
    sealedAt: null,
    rooms: [],
    clips: [],
    items: [],
  };
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [inventories, setInventories] = useState<HomeInventory[]>(() => [blankInventory(OPENING_DRAFT_ID, 1)]);
  const [selectedId, setSelectedId] = useState<string | null>(OPENING_DRAFT_ID);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const value = useMemo<InventoryContextValue>(() => {
    const selected = inventories.find((inventory) => inventory.id === selectedId) ?? null;

    function update(id: string, change: (inventory: HomeInventory) => HomeInventory) {
      setInventories((current) => current.map((inventory) => (inventory.id === id ? change(inventory) : inventory)));
    }

    return {
      inventories,
      selected,
      startInventory: () => {
        const id = crypto.randomUUID();
        setInventories((current) => {
          const number = current.reduce((max, inventory) => Math.max(max, inventory.number), 0) + 1;
          return [...current, blankInventory(id, number)];
        });
        setSelectedId(id);
      },
      selectInventory: (id) => setSelectedId(id),
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
            inventory.addressPoint && inventory.addressPoint.label !== parsed.data.trim()
              ? null
              : inventory.addressPoint,
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
      setScanReview: (id, review, mode = "replace") => {
        const parsed = reviewResultSchema.safeParse(review);
        if (!parsed.success) return;
        update(id, (inventory) => ({
          ...inventory,
          rooms:
            mode === "replace" ? parsed.data.rooms : mergeRooms(inventory.rooms, parsed.data.rooms, mode === "continue"),
        }));
      },
      addRoomItem: (inventoryId, item) => {
        const parsed = reviewItemSchema.safeParse(item);
        if (!parsed.success) return;
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
            rooms: inventory.rooms.map((room) =>
              room.id === existing.id ? { ...room, items: [...room.items, parsed.data] } : room,
            ),
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
        const note = patch.userNote === undefined ? undefined : z.string().max(500).safeParse(patch.userNote);
        if (note && !note.success) return;
        const price = money(patch.userValueUsd);
        if (price && !price.success) return;
        const replacement = money(patch.priceUsd);
        if (replacement && !replacement.success) return;
        const cash = money(patch.cashValueUsd);
        if (cash && !cash.success) return;
        const photo =
          patch.photoUrl === undefined
            ? undefined
            : patch.photoUrl === null
              ? { success: true as const, data: null }
              : z.string().max(2_000).safeParse(patch.photoUrl);
        if (photo && !photo.success) return;
        const basis = patch.valueBasis === undefined ? undefined : z.string().max(300).safeParse(patch.valueBasis ?? "");
        const brand =
          patch.brand === undefined
            ? undefined
            : patch.brand === null
              ? { success: true as const, data: null }
              : z.string().trim().max(80).safeParse(patch.brand);
        if (brand && !brand.success) return;
        const markings =
          patch.markings === undefined
            ? undefined
            : patch.markings === null
              ? { success: true as const, data: null }
              : z.string().trim().max(160).safeParse(patch.markings);
        if (markings && !markings.success) return;
        if (basis && !basis.success) return;
        const worn = patch.depreciationNote === undefined ? undefined : z.string().max(300).safeParse(patch.depreciationNote ?? "");
        if (worn && !worn.success) return;
        const source =
          patch.sourceUrl === undefined
            ? undefined
            : patch.sourceUrl === null
              ? { success: true as const, data: null }
              : z.string().max(300).safeParse(patch.sourceUrl);
        if (source && !source.success) return;
        const serial =
          patch.serial === undefined
            ? undefined
            : patch.serial === null
              ? { success: true as const, data: null }
              : z.string().max(80).safeParse(patch.serial);
        if (serial && !serial.success) return;
        const ageYears =
          patch.ageYears === undefined
            ? undefined
            : patch.ageYears === null
              ? { success: true as const, data: null }
              : z.number().finite().nonnegative().max(100).safeParse(patch.ageYears);
        if (ageYears && !ageYears.success) return;
        update(inventoryId, (inventory) => ({
          ...inventory,
          rooms: inventory.rooms.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  items: room.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          userNote: note ? note.data : item.userNote,
                          userValueUsd: price ? price.data : item.userValueUsd,
                          photoUrl: photo ? photo.data : item.photoUrl,
                          priceUsd: replacement ? replacement.data : item.priceUsd,
                          cashValueUsd: cash ? cash.data : item.cashValueUsd,
                          depreciationNote: worn ? worn.data || null : item.depreciationNote,
                          valueBasis: basis ? basis.data || null : item.valueBasis,
                          brand: brand ? brand.data || null : item.brand,
                          markings: markings ? markings.data || null : item.markings,
                          sourceUrl: source ? source.data : item.sourceUrl,
                          serial: serial ? serial.data : item.serial,
                          ageYears: ageYears ? ageYears.data : item.ageYears,
                          highValue: (replacement ? replacement.data ?? 0 : item.priceUsd ?? 0) > HIGH_VALUE_OVER_USD,
                        }
                      : item,
                  ),
                }
              : room,
          ),
        }));
      },
      deleteRoomItem: (inventoryId, roomId, itemId) => {
        update(inventoryId, (inventory) => ({
          ...inventory,
          rooms: inventory.rooms.map((room) =>
            room.id === roomId ? { ...room, items: room.items.filter((item) => item.id !== itemId) } : room,
          ),
        }));
      },
      addClip: (clip) => {
        const id = selectedIdRef.current;
        if (!id) return;
        update(id, (inventory) => ({ ...inventory, clips: [...inventory.clips, { ...clip, sourceKept: true }] }));
      },
      addItem: (item) => {
        const id = selectedIdRef.current;
        if (!id) return;
        update(id, (inventory) => ({ ...inventory, items: [...inventory.items, item] }));
      },
    };
  }, [inventories, selectedId]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const value = useContext(InventoryContext);
  if (!value) {
    throw new Error("useInventory must be used inside InventoryProvider");
  }
  return value;
}
