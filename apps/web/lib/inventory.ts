export const MAX_SCAN_MS = 100_000;
export const RECOGNIZED_OVER_USD = 10;
export const HIGH_VALUE_OVER_USD = 500;
/** A model score at or above this is treated as recognized. Below it, the person names the item. */
export const CERTAIN_CONFIDENCE = 0.9;

export type ScanClip = {
  id: string;
  startedAt: string;
  durationMs: number;
  posterUrl: string;
  videoUrl: string;
  mediaType: string;
  sourceKept: true;
  contentHash: string;
};

/** One device reading, taken only after the person presses Locate me. */
export type ScanPlace = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

/** Map point for the address they selected or that was matched from what they typed. */
export type AddressPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

/** A room is one shard. Recognition writes a room at a time. */
export type RoomItem = {
  id: string;
  name: string;
  priceUsd: number | null;
  serial: string | null;
  age: string | null;
  detail: string;
};

export type RoomShard = {
  id: string;
  title: string;
  items: RoomItem[];
};

export type HomeInventory = {
  id: string;
  /** Stable count, kept off the scan screen. */
  number: number;
  title: string;
  /** Address of the insured property, as typed or chosen. */
  homeAddress: string;
  addressPoint: AddressPoint | null;
  place: ScanPlace | null;
  /** SHA-256 of the sealed declaration and the walkthrough. Empty until Create inventory. */
  recordHash: string | null;
  sealedAt: string | null;
  rooms: RoomShard[];
  clips: ScanClip[];
  items: EnteredItem[];
};

export const ADDRESS_MATCH_MILES = 1;

export function inventoryLabel(inventory: HomeInventory) {
  const title = inventory.title.trim();
  return title || "Untitled";
}

export function milesBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthMiles = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const start = toRadians(from.latitude);
  const end = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(start) * Math.cos(end) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export async function sha256Hex(data: BufferSource | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type EnteredItem = {
  id: string;
  name: string;
  description: string;
  /** Price the person entered from a source. Absent until they have one. */
  value: number | null;
  photoUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: "entered";
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function enteredTotal(items: EnteredItem[]) {
  return items.reduce((sum, item) => sum + (item.value ?? 0), 0);
}

export function videoExtension(mediaType: string) {
  if (mediaType.includes("mp4")) return "mp4";
  return "webm";
}

function csvCell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function inventoryCsv(inventory: HomeInventory) {
  const header = [
    "inventory",
    "home_address",
    "latitude",
    "longitude",
    "accuracy_meters",
    "located_at",
    "record",
    "item",
    "description",
    "quantity",
    "source_backed_value_usd",
    "confidence",
    "source_file",
    "scan_started_at",
    "duration_seconds",
  ];
  const place = inventory.place;
  const shared = [
    inventoryLabel(inventory),
    inventory.homeAddress.trim(),
    place ? place.latitude.toFixed(5) : "",
    place ? place.longitude.toFixed(5) : "",
    place ? Math.round(place.accuracyMeters) : "",
    place ? place.capturedAt : "",
  ];
  const rows = [header.join(",")];

  for (const item of inventory.items) {
    rows.push(
      [
        ...shared,
        "entered",
        item.name,
        item.description,
        1,
        item.value ?? "",
        "entered by you",
        item.sourceName ?? "",
        "",
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  inventory.clips.forEach((clip, index) => {
    rows.push(
      [
        ...shared,
        "recorded-scan",
        `Walkthrough ${index + 1}`,
        "Source video kept for verification",
        "",
        "",
        "pending recognition",
        "",
        clip.startedAt,
        Math.round(clip.durationMs / 1000),
      ]
        .map(csvCell)
        .join(","),
    );
  });

  return rows.join("\n");
}

export function proofText(inventory: HomeInventory) {
  const place = inventory.place;
  const lines = [
    `100proof · ${inventoryLabel(inventory)}`,
    "Walkthrough record. This does not decide coverage and it is not a sworn proof of loss.",
    "",
    inventory.homeAddress.trim()
      ? `Address of insured property: ${inventory.homeAddress.trim()}`
      : "Address of insured property: not entered.",
    inventory.recordHash ? `Record hash: ${inventory.recordHash}` : "Record hash: not sealed.",
    place
      ? `Device location: ${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)} · within about ${Math.round(place.accuracyMeters)} m · ${formatWhen(place.capturedAt)}`
      : "Device location: not recorded.",
    "",
  ];

  if (inventory.items.length === 0 && inventory.clips.length === 0) {
    lines.push("No items yet.");
  }

  if (inventory.items.some((item) => item.value != null)) {
    lines.push(`Entered total: ${formatMoney(enteredTotal(inventory.items))}`);
  }

  if (inventory.items.length > 0) {
    lines.push("", "Items entered by you");
    for (const item of inventory.items) {
      const price = item.value == null ? "no price yet" : formatMoney(item.value);
      lines.push(`${item.name} · ${price} · ${item.description}`);
      if (item.sourceName) lines.push(`  Source: ${item.sourceName}`);
    }
  }

  if (inventory.clips.length > 0) {
    lines.push("", "Recorded scans");
    inventory.clips.forEach((clip, index) => {
      lines.push(
        `Walkthrough ${index + 1}: ${formatWhen(clip.startedAt)} · ${formatClock(clip.durationMs)} · source kept`,
      );
    });
  }

  lines.push(
    "",
    `A later scan lists an item it prices over $${RECOGNIZED_OVER_USD}.`,
    `An item it scores under ${Math.round(CERTAIN_CONFIDENCE * 100)}% waits for a name, a price, and a source.`,
    `An item over $${HIGH_VALUE_OVER_USD} is marked high value.`,
  );
  return lines.join("\n");
}
