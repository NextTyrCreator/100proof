"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { AddressPoint, EnteredItem, HomeInventory, ScanClip, ScanPlace } from "../lib/inventory";

const titleSchema = z.string().max(80);
const addressSchema = z.string().max(200);
const addressPointSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  label: z.string().trim().min(1).max(200),
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
  setHomeAddress: (id: string, address: string) => void;
  setAddressPoint: (id: string, point: AddressPoint | null) => void;
  pinAddress: (id: string, point: AddressPoint) => void;
  setScanPlace: (id: string, place: ScanPlace) => void;
  sealRecord: (id: string, hash: string, sealedAt: string) => void;
  renameRoom: (inventoryId: string, roomId: string, title: string) => void;
  deleteRoomItem: (inventoryId: string, roomId: string, itemId: string) => void;
  addClip: (clip: Omit<ScanClip, "sourceKept">) => void;
  addItem: (item: EnteredItem) => void;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

function blankInventory(id: string, number: number): HomeInventory {
  return {
    id,
    number,
    title: "",
    homeAddress: "",
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
  const [inventories, setInventories] = useState<HomeInventory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      renameRoom: (inventoryId, roomId, title) => {
        const parsed = titleSchema.safeParse(title);
        if (!parsed.success) return;
        update(inventoryId, (inventory) => ({
          ...inventory,
          rooms: inventory.rooms.map((room) => (room.id === roomId ? { ...room, title: parsed.data } : room)),
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
