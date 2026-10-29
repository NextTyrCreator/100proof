import { addressRegionLabel } from "./address-search";

export const MAX_SCAN_MS = 5 * 60 * 1000;
/** Ordinary goods at or above this replacement price are their own row. Under it, they are grouped. */
export const GROUP_UNDER_USD = 100;
export const HIGH_VALUE_OVER_USD = 500;
/** A model score at or above this is treated as recognized. Below it, the person names the item. */
export const CERTAIN_CONFIDENCE = 0.9;

export type Wearer = "women" | "men" | "kids" | "unknown";
export type SizeBand = "kids" | "adults" | "unknown";

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

/** One device reading, taken when the person presses Next. */
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
  detail: string;
  count: number;
  /** Unit replacement cost today, in the property's zip when a price comes back. */
  priceUsd: number | null;
  /** Unit cash value after an adjuster's depreciation estimate. */
  cashValueUsd: number | null;
  depreciationNote: string | null;
  /** Kept on the item. The price search uses brand and model, not this string. */
  serial: string | null;
  age: string | null;
  ageYears: number | null;
  color: string | null;
  size: string | null;
  category: string | null;
  itemType: string | null;
  /** Maker, only when a name or logo was visible or spoken. */
  brand: string | null;
  /** Model, logo, or label that changes the replacement price. Not a serial. */
  markings: string | null;
  wearer: Wearer | null;
  sizeBand: SizeBand | null;
  /** Under $100 and bunched with the same kind of piece. */
  grouped: boolean;
  enteredBy: "scan" | "you";
  narration: string | null;
  valueBasis: string | null;
  sourceUrl: string | null;
  userNote: string;
  /** What the person says it costs. Kept apart from the replacement estimate. */
  userValueUsd: number | null;
  photoUrl: string | null;
  highValue: boolean;
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
  /** Id from the address-region list. Empty until they choose one. */
  addressRegion: string;
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

export function locationMiles(inventory: HomeInventory) {
  if (!inventory.place || !inventory.addressPoint) return null;
  return milesBetween(inventory.place, inventory.addressPoint);
}

export function locationCheckLabel(inventory: HomeInventory) {
  const miles = locationMiles(inventory);
  if (miles == null) return "";
  return miles <= ADDRESS_MATCH_MILES ? "within 1 mile" : "farther than 1 mile";
}

function locationProofLine(inventory: HomeInventory) {
  const place = inventory.place;
  if (!place) return "Location check: not recorded.";
  const miles = locationMiles(inventory);
  const when = formatWhen(place.capturedAt);
  if (miles == null) return `Location check: recorded ${when}. The range was not compared.`;
  if (miles <= ADDRESS_MATCH_MILES) return `Location check: within 1 mile of the insured property. ${when}`;
  return `Location check: farther than 1 mile. Full verification needs the device within 1 mile. ${when}`;
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

export function replacementTotal(inventory: HomeInventory) {
  const itemized = inventory.rooms.reduce(
    (sum, room) => sum + room.items.reduce((roomSum, item) => roomSum + (item.priceUsd ?? 0) * item.count, 0),
    0,
  );
  return itemized;
}

export function userEnteredItem(name: string, count: number, note: string): RoomItem {
  return {
    id: crypto.randomUUID(),
    name,
    detail: note,
    count,
    priceUsd: null,
    cashValueUsd: null,
    depreciationNote: null,
    serial: null,
    age: null,
    ageYears: null,
    color: null,
    size: null,
    category: "other",
    itemType: name,
    brand: null,
    markings: null,
    wearer: null,
    sizeBand: null,
    grouped: false,
    enteredBy: "you",
    narration: null,
    valueBasis: null,
    sourceUrl: null,
    userNote: note,
    userValueUsd: null,
    photoUrl: null,
    highValue: false,
  };
}

export function cashValueTotal(inventory: HomeInventory) {
  return inventory.rooms.reduce(
    (sum, room) => sum + room.items.reduce((roomSum, item) => roomSum + (item.cashValueUsd ?? 0) * item.count, 0),
    0,
  );
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
    "country",
    "home_address",
    "location_check",
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
    "color",
    "size",
    "serial",
    "replacement_estimate_usd",
    "replacement_basis",
    "your_note",
    "high_value",
    "category",
    "wearer",
    "size_band",
    "grouped",
    "cash_value_usd",
    "depreciation_note",
    "brand",
    "markings",
  ];
  const place = inventory.place;
  const shared = [
    inventoryLabel(inventory),
    addressRegionLabel(inventory.addressRegion),
    inventory.homeAddress.trim(),
    locationCheckLabel(inventory),
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
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  for (const room of inventory.rooms) {
    for (const item of room.items) {
      rows.push(
        [
          ...shared,
          `recognized · ${room.title}`,
          item.name,
          item.detail,
          item.count,
          item.userValueUsd ?? "",
          item.enteredBy === "you" ? "entered by you" : item.grouped ? "grouped under 100" : item.highValue ? "high value" : "replacement estimate",
          "",
          "",
          "",
          item.color ?? "",
          item.size ?? "",
          item.serial ?? "",
          item.priceUsd ?? "",
          item.valueBasis ?? "",
          item.userNote,
          item.highValue ? "yes" : "",
          item.category ?? "",
          item.wearer ?? "",
          item.sizeBand ?? "",
          item.grouped ? "yes" : "",
          item.cashValueUsd ?? "",
          item.depreciationNote ?? "",
          item.brand ?? "",
          item.markings ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
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
        "source kept",
        "",
        clip.startedAt,
        Math.round(clip.durationMs / 1000),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  });

  return rows.join("\n");
}

export function proofText(inventory: HomeInventory) {
  const lines = [
    `100proof · ${inventoryLabel(inventory)}`,
    "Walkthrough record. This does not decide coverage and it is not a sworn proof of loss.",
    "",
    addressRegionLabel(inventory.addressRegion)
      ? `Country: ${addressRegionLabel(inventory.addressRegion)}`
      : "Country: not entered.",
    inventory.homeAddress.trim()
      ? `Address of insured property: ${inventory.homeAddress.trim()}`
      : "Address of insured property: not entered.",
    inventory.recordHash ? `Record hash: ${inventory.recordHash}` : "Record hash: not sealed.",
    locationProofLine(inventory),
    "",
  ];

  if (inventory.items.length === 0 && inventory.clips.length === 0 && inventory.rooms.length === 0) {
    lines.push("No items yet.");
  }

  if (inventory.rooms.length > 0) {
    lines.push("", "Items from the walkthrough");
    for (const room of inventory.rooms) {
      lines.push(room.title);
      for (const item of room.items) {
        const price = item.priceUsd == null ? "no replacement amount yet" : `${formatMoney(item.priceUsd)} to replace`;
        const cash = item.cashValueUsd == null ? "" : ` · cash value ${formatMoney(item.cashValueUsd)}`;
        const yourPrice = item.userValueUsd == null ? "" : ` · you entered ${formatMoney(item.userValueUsd)}`;
        const who = item.enteredBy === "you" ? " · entered by you" : item.grouped ? " · grouped" : "";
        lines.push(`  ${item.name} × ${item.count} · ${price}${cash}${yourPrice}${who}`);
        const traits = [item.brand, item.markings, item.category, item.wearer, item.sizeBand, item.color, item.size, item.age].filter(Boolean).join(" · ");
        if (traits) lines.push(`  ${traits}`);
        if (item.detail) lines.push(`  ${item.detail}`);
        if (item.narration) lines.push(`  You said: ${item.narration}`);
        if (item.depreciationNote) lines.push(`  ${item.depreciationNote}`);
        if (item.valueBasis) lines.push(`  ${item.valueBasis}`);
        if (item.serial) lines.push(`  Serial: ${item.serial}`);
        if (item.userNote) lines.push(`  Note: ${item.userNote}`);
        if (item.highValue) lines.push("  High value");
      }
    }
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
    `Ordinary pieces under $${GROUP_UNDER_USD} are counted on a category line. Jewelry, electronics, furniture, and anything with a serial stay on their own row.`,
    "Replacement follows the brand and the marks that were visible. The exact product is used when it is for sale. Otherwise the amount is a similar item of like kind and quality in the property's zip.",
    "Cash value is that replacement after an adjuster's depreciation estimate. Neither amount is what the carrier must pay.",
    "An amount you enter stays separate from that estimate.",
    `A piece over $${HIGH_VALUE_OVER_USD} is marked high value.`,
  );
  return lines.join("\n");
}
