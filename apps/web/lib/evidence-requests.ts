import type { EvidenceKind, RoomItem, RoomShard } from "./inventory";

/**
 * Ask for the evidence most likely to settle the most money for the least effort.
 * score = dollars in doubt / effort. A typed answer costs least; filming another clip costs most.
 */
const EFFORT: Record<EvidenceKind, number> = { question: 1, label: 2, receipt: 3, wider: 4 };

/** Below this many dollars in doubt, the line is left as it is. */
const ASK_OVER_USD = 25;

export const SHOWN_AT_ONCE = 3;

export type EvidenceRequest = {
  key: string;
  roomId: string;
  roomTitle: string;
  itemId: string;
  itemName: string;
  kind: EvidenceKind;
  prompt: string;
  why: string;
  inDoubtUsd: number;
  score: number;
};

function unit(item: RoomItem) {
  return item.priceUsd ?? item.options.reduce((max, option) => Math.max(max, option.highUsd), 0);
}

function identityDoubt(item: RoomItem) {
  if (item.options.length >= 2) {
    const low = Math.min(...item.options.map((option) => option.lowUsd));
    const high = Math.max(...item.options.map((option) => option.highUsd));
    return (high - low) * item.count;
  }
  return unit(item) * 0.5 * item.count;
}

function countDoubt(item: RoomItem) {
  return unit(item) * Math.max(1, Math.ceil(item.count / 2));
}

function open(item: RoomItem, kind: EvidenceKind) {
  if (item.enteredBy === "you" || item.skipped.includes(kind)) return false;
  if (kind === "label") return !item.identitySettled;
  if (kind === "wider") return !item.countSettled;
  if (kind === "receipt") return item.ask?.kind === "receipt" && item.userValueUsd == null;
  return item.ask?.kind === "question" && !item.said.some((fact) => fact.heard === "typed");
}

function promptFor(item: RoomItem, kind: EvidenceKind) {
  const name = item.name.toLowerCase();
  if (kind === "label") return `Snap the label or model plate on the ${name}.`;
  if (kind === "wider") return `Step back and film every ${name} in one view.`;
  if (kind === "receipt") return `Snap the receipt for the ${name}, if you have it.`;
  return item.ask?.prompt || `Tell us more about the ${name}.`;
}

function whyFor(item: RoomItem, kind: EvidenceKind, doubt: number) {
  const amount = `$${Math.round(doubt).toLocaleString("en-US")}`;
  if (kind === "label") {
    return item.options.length >= 2
      ? `The model is not readable. The likely models differ by about ${amount}.`
      : `The brand or model is not readable. About ${amount} depends on it.`;
  }
  if (kind === "wider") return `Part of the group was out of view, so the count of ${item.count} is not settled.`;
  if (kind === "receipt") return "What was paid would back this line better than a comparable.";
  return "A short answer would settle this line.";
}

export function openRequests(rooms: RoomShard[]): EvidenceRequest[] {
  const requests: EvidenceRequest[] = [];
  for (const room of rooms) {
    for (const item of room.items) {
      for (const kind of ["label", "wider", "receipt", "question"] as const) {
        if (!open(item, kind)) continue;
        const doubt =
          kind === "label"
            ? identityDoubt(item)
            : kind === "wider"
              ? countDoubt(item)
              : kind === "receipt"
                ? unit(item) * 0.25 * item.count
                : unit(item) * 0.2 * item.count;
        if (doubt < ASK_OVER_USD) continue;
        requests.push({
          key: `${item.id}:${kind}`,
          roomId: room.id,
          roomTitle: room.title,
          itemId: item.id,
          itemName: item.name,
          kind,
          prompt: promptFor(item, kind),
          why: whyFor(item, kind, doubt),
          inDoubtUsd: Math.round(doubt),
          score: doubt / EFFORT[kind],
        });
      }
    }
  }
  return requests.sort((a, b) => b.score - a.score);
}

/** Lines that are still open after their requests, for the exception list. */
export function unresolvedCount(rooms: RoomShard[]) {
  return new Set(openRequests(rooms).map((request) => request.itemId)).size;
}
