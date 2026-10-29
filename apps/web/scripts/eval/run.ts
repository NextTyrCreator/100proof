/**
 * Guided versus unguided, on the same recorded walkthrough.
 *
 *   corepack pnpm --filter @100proof/web eval scripts/eval/cases/<case>.json
 *
 * Unguided: the clips are reviewed and scored as they come back.
 * Guided: the same review, then the ranked evidence requests are answered with the evidence the case provides
 * (a label picture, a receipt, a typed answer, or a wider clip), through the same code the app uses.
 * Media and results stay on this machine; both folders are ignored by git.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { z } from "zod";
import { summarizeCalls } from "../../lib/call-measures";
import { scoreRooms, matchLines, truthLineSchema, type TruthLine } from "../../lib/eval-score";
import { openRequests, type EvidenceRequest } from "../../lib/evidence-requests";
import type { ChangeSource, RoomItem, RoomShard } from "../../lib/inventory";
import { combinePieceReviews, mergeRooms, patchReviewItem, tagReview } from "../../lib/inventory-merge";
import { reviewEvidence, reviewWalkthrough, type ModelCall } from "../../lib/review-scan";
import type { PricePlace, ReviewResult } from "../../lib/review-shape";

const evidenceSchema = z.object({
  truth: z.string().trim().min(1).max(120),
  kind: z.enum(["label", "receipt", "answer", "wider"]),
  image: z.string().max(300).optional(),
  answer: z.string().max(500).optional(),
  video: z.string().max(300).optional(),
  audio: z.string().max(300).optional(),
});

const caseSchema = z.object({
  name: z.string().trim().regex(/^[\w-]{1,60}$/),
  zip: z.string().trim().max(12).nullable().default(null),
  jurisdiction: z.string().trim().min(1).max(120),
  clips: z
    .array(z.object({ video: z.string().max(300), audio: z.string().max(300).nullable().default(null) }))
    .min(1)
    .max(10),
  truth: z.array(truthLineSchema).min(1).max(200),
  evidence: z.array(evidenceSchema).max(50).default([]),
  maxRequests: z.number().int().min(1).max(20).default(5),
});

type Case = z.infer<typeof caseSchema>;

const MEDIA: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function mediaType(path: string) {
  const type = MEDIA[extname(path).toLowerCase()];
  if (!type) throw new Error(`Unsupported file type: ${path}`);
  return type;
}

async function walkthrough(userId: string, base: string, clips: Case["clips"], place: PricePlace, calls: ModelCall[], focus: string[] = []) {
  let combined: ReviewResult = { rooms: [] };
  for (const [index, clip] of clips.entries()) {
    const video = join(base, clip.video);
    const audio = clip.audio ? await readFile(join(base, clip.audio)) : null;
    const result = await reviewWalkthrough(userId, await readFile(video), mediaType(video), [], place, { part: index + 1, parts: clips.length }, { audio, focus });
    calls.push(...result.calls);
    const tagged = tagReview(result.review, randomUUID());
    combined = index === 0 ? tagged : combinePieceReviews(combined, tagged);
  }
  return combined;
}

function detailOf(item: RoomItem) {
  return {
    name: item.name,
    itemType: item.itemType,
    brand: item.brand,
    markings: item.markings,
    serial: item.serial,
    note: item.userNote,
    ageYears: item.ageYears,
    count: item.count,
    priceUsd: item.priceUsd,
    options: item.options,
    question: item.ask?.kind === "question" ? item.ask.prompt : "",
  };
}

const ASKED_TO_GIVEN = { label: "label", receipt: "receipt", question: "answer", wider: "wider" } as const;
const SOURCE = { label: "label photo", receipt: "receipt photo", answer: "your answer" } as const satisfies Record<string, ChangeSource>;

/** Which truth line each listed line is, by the same matcher the score uses. */
function truthFor(truth: TruthLine[], rooms: RoomShard[], itemId: string) {
  const lines = rooms.flatMap((room) => room.items);
  for (const [t, l] of matchLines(truth, lines)) if (lines[l]?.id === itemId) return truth[t];
  return null;
}

async function guide(userId: string, base: string, spec: Case, start: RoomShard[], place: PricePlace, calls: ModelCall[]) {
  let rooms = structuredClone(start);
  const actions: { asked: EvidenceRequest["kind"]; item: string; inDoubtUsd: number; given: boolean; changed: string[] }[] = [];
  const asked = openRequests(rooms).slice(0, spec.maxRequests);

  for (const request of asked) {
    const item = rooms.flatMap((room) => room.items).find((line) => line.id === request.itemId);
    if (!item) continue;
    const truth = truthFor(spec.truth, rooms, item.id);
    const given = truth
      ? spec.evidence.find((entry) => entry.truth.toLowerCase() === truth.name.toLowerCase() && entry.kind === ASKED_TO_GIVEN[request.kind])
      : undefined;
    if (!given) {
      actions.push({ asked: request.kind, item: item.name, inDoubtUsd: request.inDoubtUsd, given: false, changed: [] });
      continue;
    }
    const logged = item.changes.length;
    if (given.kind === "wider") {
      if (!given.video) throw new Error(`Evidence for ${given.truth} needs a video.`);
      const focused = await walkthrough(userId, base, [{ video: given.video, audio: given.audio ?? null }], place, calls, [item.name]);
      rooms = mergeRooms(rooms, focused.rooms, "focus", [item.id]);
    } else {
      const image = given.image ? { bytes: await readFile(join(base, given.image)), mediaType: mediaType(given.image) } : null;
      const result = await reviewEvidence(userId, given.kind, image, given.answer ?? "", detailOf(item), place);
      calls.push(...result.calls);
      rooms = patchReviewItem({ rooms }, item.id, result.patch, SOURCE[given.kind], null).rooms;
    }
    const after = rooms.flatMap((room) => room.items).find((line) => line.id === item.id);
    const changed = [...new Set((after?.changes.slice(logged) ?? []).flatMap((entry) => Object.keys(entry.after)))];
    actions.push({ asked: request.kind, item: item.name, inDoubtUsd: request.inDoubtUsd, given: true, changed });
  }
  return { rooms, actions };
}

function line(label: string, unguided: number | null, guided: number | null) {
  const show = (value: number | null) => (value == null ? "—" : String(value));
  console.log(`${label.padEnd(22)} ${show(unguided).padStart(8)} ${show(guided).padStart(8)}`);
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Pass a case file: scripts/eval/cases/<case>.json");
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // The Meta key can also come from the shell.
  }
  const casePath = resolve(path);
  const spec = caseSchema.parse(JSON.parse(await readFile(casePath, "utf8")));
  const base = dirname(casePath);
  const place: PricePlace = { zip: spec.zip, jurisdiction: spec.jurisdiction };
  const userId = `eval-${spec.name}`;

  const unguidedCalls: ModelCall[] = [];
  const unguided = await walkthrough(userId, base, spec.clips, place, unguidedCalls);
  const guidedCalls: ModelCall[] = [];
  const guided = await guide(userId, base, spec, unguided.rooms, place, guidedCalls);

  const before = scoreRooms(spec.truth, unguided.rooms);
  const after = scoreRooms(spec.truth, guided.rooms);
  const result = {
    case: spec.name,
    ranAt: new Date().toISOString(),
    unguided: before,
    guided: after,
    actions: guided.actions,
    cost: { unguided: summarizeCalls(unguidedCalls), guidedExtra: summarizeCalls(guidedCalls) },
  };

  const out = resolve("scripts/eval/results");
  await mkdir(out, { recursive: true });
  const file = join(out, `${spec.name}-${result.ranAt.replaceAll(":", "-")}.json`);
  await writeFile(file, JSON.stringify(result, null, 2));

  console.log(`\n${spec.name}: ${spec.truth.length} truth lines\n`);
  console.log(`${"".padEnd(22)} ${"unguided".padStart(8)} ${"guided".padStart(8)}`);
  line("found", before.found, after.found);
  line("count right", before.countRight, after.countRight);
  line("identity right", before.identityRight, after.identityRight);
  line("value within 25%", before.valueWithin25, after.valueWithin25);
  line("median value error", before.medianValueError, after.medianValueError);
  line("open lines", before.openLines, after.openLines);
  line("wrong but settled", before.wrongButSettled, after.wrongButSettled);
  line("extra lines", before.extraLines, after.extraLines);
  console.log(`\nRequests asked ${guided.actions.length}, answered ${guided.actions.filter((action) => action.given).length}.`);
  console.log(`Saved ${file}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
