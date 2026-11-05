import { z } from "zod";
import type { RoomItem, RoomShard } from "./inventory";

/**
 * Before and after. A Scan more walk is matched object by object against what was saved. Each saved line
 * is seen again, moved, changed (damage seen now that was not before), a possible match the owner has not
 * answered, not seen in this walk, or not checked because its room was not entered. It never says missing
 * or stolen: a walk can simply not show something.
 */
const statusSchema = z.enum(["seen", "moved", "changed", "possible", "not seen", "not checked"]);

type WalkStatus = z.infer<typeof statusSchema>;

export const walkCompareSchema = z.object({
  at: z.string().max(40),
  /** When the earlier walk was filmed, for "Not seen since …". */
  since: z.string().max(40).nullable(),
  entries: z
    .array(
      z.object({
        ids: z.array(z.string().min(1).max(80)).min(1).max(2),
        name: z.string().trim().min(1).max(120),
        room: z.string().trim().min(1).max(80),
        toRoom: z.string().trim().max(80).nullable(),
        status: statusSchema,
      }),
    )
    .max(300),
  added: z.number().int().nonnegative().max(1000),
});

export type WalkCompare = z.infer<typeof walkCompareSchema>;

type Pair = { aId: string; bId: string; sure: boolean };

function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** `pairs` are saved-to-new pairs from `crossPairs`, saved line first. */
export function compareWalks(saved: RoomShard[], fresh: RoomShard[], pairs: Pair[], enteredRooms: string[], since: string | null): WalkCompare {
  const freshLines = new Map<string, { line: RoomItem; room: string }>();
  for (const room of fresh) for (const line of room.items) freshLines.set(line.id, { line, room: room.title });
  const matched = new Map(pairs.map((pair) => [pair.aId, pair]));
  const entered = enteredRooms.filter(Boolean);
  const entries: WalkCompare["entries"] = [];
  const usedFresh = new Set<string>();
  for (const room of saved) {
    for (const line of room.items) {
      if (line.enteredBy !== "scan" || line.hidden) continue;
      const pair = matched.get(line.id);
      const other = pair ? freshLines.get(pair.bId) : undefined;
      if (pair && other) {
        usedFresh.add(pair.bId);
        const moved = !same(other.room, room.title);
        const changed = !line.damage && Boolean(other.line.damage);
        const status: WalkStatus = !pair.sure ? "possible" : changed ? "changed" : moved ? "moved" : "seen";
        entries.push({ ids: [line.id, pair.bId], name: line.name.slice(0, 120), room: room.title.slice(0, 80), toRoom: moved ? other.room.slice(0, 80) : null, status });
        continue;
      }
      const status: WalkStatus = entered.some((title) => same(title, room.title)) ? "not seen" : "not checked";
      entries.push({ ids: [line.id], name: line.name.slice(0, 120), room: room.title.slice(0, 80), toRoom: null, status });
    }
  }
  const added = [...freshLines.keys()].filter((id) => !usedFresh.has(id)).length;
  return { at: new Date().toISOString(), since, entries: entries.slice(0, 300), added };
}

export function walkCounts(compare: WalkCompare) {
  const count = (status: WalkStatus) => compare.entries.filter((entry) => entry.status === status).length;
  return {
    seen: count("seen"),
    moved: count("moved"),
    changed: count("changed"),
    possible: count("possible"),
    notSeen: count("not seen"),
    notChecked: count("not checked"),
    added: compare.added,
  };
}

/** The words on a line. Plain about what a walk can and cannot show. */
export function walkLabel(entry: WalkCompare["entries"][number], since: string | null) {
  const when = since ? new Date(since).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "the last walk";
  if (entry.status === "seen") return "Seen again";
  if (entry.status === "moved") return `Moved to ${entry.toRoom ?? "another room"}`;
  if (entry.status === "changed") return "Seen again, with damage not seen before";
  if (entry.status === "possible") return "Possibly seen again";
  if (entry.status === "not seen") return `Not seen since ${when}`;
  return "Not checked: its room was not filmed";
}
