/**
 * The testing engine. Deterministic checks over the parts that must never quietly break:
 * the accuracy mark, the invariant/outlier checks, the evidence ranking, the eval scorer, label requests,
 * spoken ages, the scan clock, the two-in-flight clip pipeline, pricing, and the repeat check.
 *
 *   corepack pnpm --filter @100proof/web harness
 *
 * Exit code 1 on any failure, so it can gate a release. It calls no models and needs no keys.
 * The model-calling eval is separate (`scripts/eval/run.ts`); this harness is the always-on floor.
 */
import { cleanTranscript } from "@100proof/meta-client";
import { accuracyMark, accuracySummary } from "../../lib/accuracy-mark";
import { scoreRooms, type TruthLine } from "../../lib/eval-score";
import { labelWorthAsking, openRequests } from "../../lib/evidence-requests";
import { inventoryCsv, proofText, replacementTotal, type HomeInventory, type ItemChange, type RoomItem, type RoomShard } from "../../lib/inventory";
import { documentMeasures } from "../../lib/inventory-measures";
import { HOUSE_STUDY, newUserMinutes, scoreHouseWalk } from "../../lib/house-study";
import { checkLines } from "../../lib/invariants";
import { applyPatch, mergeRooms, moveClipLines } from "../../lib/inventory-merge";
import { applyPrices, applyReconcile, joinRepeatPair, joinSurePairs, pricedFrom, shareKnownPrices } from "../../lib/scan-pipeline";
import { ageFromSpeech, asCondition, clearSharedSightings, depreciate, isBlankFact, isNotProperty, modelRecognized, salvageRoomsJson, shapeWalkthrough } from "../../lib/review-shape";
import {
  APPRAISAL_BASIS,
  appraisalDocumented,
  assessedReplacement,
  confidenceTone,
  isModelNumber,
  lineConfidence,
  statedConflict,
  statedUsd,
} from "../../lib/line-confidence";
import { chipText, rowSubtitle, shortName } from "../../lib/line-row";
import { allCorrect, COUNTING_RULES, EXPECTED, expectedUnits, RESEARCH_SERIES, roomTotals, SCORECARD_BASELINE, scoreRun, scoreSeries } from "../../lib/scorecard";
import { ADD_LIMIT_MS, advanceClock, blankClock, CLIP_NUMBER_LIMIT, clipsToSend, readyInOrder, SCAN_LIMIT_MS } from "../../lib/scan-session";
import {
  cleanItemName,
  clipRoomLabel,
  DEMO_ROOMS,
  foldRoomTitle,
  MORE_ROOMS,
  roomAt,
  roomChangeHint,
  roomMarkersSchema,
  ROOM_NOT_SET,
  roomQuestionSchema,
  withMarker,
  withoutTappedFolds,
} from "../../lib/scan-rooms";
import { cleanRoomNames, fromLoaded, toSaveRequest } from "../../lib/inventory-sync";
import { compareLines, crossPairs, pairKey, repeatPairs, repeatQuestions, repeatQuestionSchema } from "../../lib/repeat-match";
import { verdictText } from "../../lib/same-object-client";
import { compareReads, needsReadTwice, readsDisagree, readTwiceSummary, resolveIdentity, withIdentityCheck } from "../../lib/read-twice";
import { identityCheckSchema } from "../../lib/identity-check";
import { bandOf, proofLedger } from "../../lib/proof-ledger";
import { replayCaption, replayWindow } from "../../lib/replay";
import { compareWalks, walkCounts, walkLabel } from "../../lib/walk-compare";
import { BELONGS_PROMPT, belongsSchema, notHereKey, withoutNotHere } from "../../lib/belongs";
import { blankScanStats } from "../../lib/scan-stats";
import { inventoryJson } from "../../lib/inventory-export";
import { buildScanMetrics, compareMetrics, scanMetricsSchema, trendMarkdown, trendSummary } from "../../research/scan-metrics";
import { demoCards, demoCompareMarkdown } from "../../research/demo-compare";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function item(patch: Partial<RoomItem>): RoomItem {
  return {
    id: "line-1",
    name: "Television",
    detail: "",
    count: 1,
    priceUsd: 1100,
    cashValueUsd: 700,
    depreciationNote: null,
    serial: null,
    age: null,
    ageYears: null,
    color: null,
    size: null,
    category: null,
    itemType: "television",
    brand: "Samsung",
    markings: "QN65Q80C",
    wearer: null,
    sizeBand: null,
    grouped: false,
    enteredBy: "scan",
    narration: null,
    valueBasis: "Exact: Samsung QN65Q80C",
    sourceUrl: null,
    userNote: "",
    userValueUsd: null,
    photoUrl: null,
    photoPath: null,
    files: [],
    declared: false,
    hidden: false,
    highValue: false,
    sightings: [
      { clipId: "clip-1", atSec: 4 },
      { clipId: "clip-2", atSec: 9 },
    ],
    said: [{ text: "Samsung, about three years old", clipId: "clip-1", atSec: 4, heard: "transcript" }],
    countSettled: true,
    identitySettled: true,
    options: [],
    ask: null,
    skipped: [],
    pricedAt: "2026-10-29T00:00:00.000Z",
    changes: [],
    ...patch,
  } as RoomItem;
}

function room(items: RoomItem[]): RoomShard[] {
  return [{ id: "room-1", title: "Living room", items }];
}

function receiptChange(paid: number): ItemChange {
  return {
    id: "change-1",
    at: "2026-10-29T00:00:00.000Z",
    source: "receipt photo",
    evidenceRef: "org/inventory/line-1-receipt.jpg",
    before: { userValueUsd: null },
    after: { userValueUsd: paid },
  };
}

// Accuracy mark: the no-receipt ceiling, and the receipt's job.
{
  const strong = accuracyMark(
    item({
      sourceUrl: "https://store.example/tv",
      changes: [{ id: "label-1", at: "2026-10-29T00:00:00.000Z", source: "label photo", evidenceRef: null, before: {}, after: { markings: "QN65Q80C" } }],
    }),
  );
  check("mark: corroborated line is Strong without a receipt", strong.tier === "strong" && strong.met >= 5, `${strong.met}/${strong.total}`);
  const receipt = accuracyMark(item({ userValueUsd: 950, changes: [receiptChange(950)] }));
  check("mark: receipt confirms individuality", receipt.tier === "receipt" && receipt.receiptConfirmed);
  const typed = accuracyMark(item({ userValueUsd: 950 }));
  check("mark: a typed price paid is not a receipt", typed.tier !== "receipt" && !typed.receiptConfirmed);
  const missed = accuracyMark(item({ changes: [{ ...receiptChange(950), after: {} }] }));
  check("mark: a receipt that did not list the item verifies nothing", missed.tier !== "receipt");
  const estimate = accuracyMark(item({ identitySettled: false, markings: null, priceUsd: 200, sourceUrl: "https://store.example/kettle", valueBasis: "Comparable: kettle" }));
  check("mark: under $250, a priced, counted line with an open model is counted", estimate.tier !== "open", estimate.label);
  const highOpen = accuracyMark(item({ identitySettled: false, markings: null, sourceUrl: "https://store.example/tub", valueBasis: "Comparable: hot tub" }));
  check("mark: over $250, a brand with no version shown is not counted and asks for a close-up", highOpen.tier === "open" && /close photo/.test(highOpen.next ?? ""), highOpen.label);
  const open = accuracyMark(item({ countSettled: false, sightings: [{ clipId: "clip-1", atSec: 4 }], said: [] }));
  check("mark: unsettled count needs evidence, with a next step", open.tier === "open" && open.next != null);
  const entered = accuracyMark(item({ enteredBy: "you", sightings: [] }));
  check("mark: hand-entered line is never scan-graded", entered.tier === "entered");
  const summary = accuracySummary([item({}), item({ userValueUsd: 950, changes: [receiptChange(950)] }), item({ countSettled: false })]);
  check("mark: summary separates receipt from no-receipt strength", summary.receipt === 1 && summary.strongWithoutReceiptShare != null);
}

// Invariants: contradictions are blockers, outliers are review items.
{
  const clean = checkLines([item({})], new Date("2026-10-29T00:00:00.000Z"));
  check("invariants: a clean line raises nothing", clean.length === 0, clean.map((issue) => issue.code).join(","));
  const cash = checkLines([item({ cashValueUsd: 1300 })]);
  check("invariants: cash above replacement is a blocker", cash.some((issue) => issue.severity === "blocker" && issue.code === "cash-over-replacement"));
  const dupes = checkLines([item({ id: "a", serial: "SN-1" }), item({ id: "b", serial: "SN-1" })]);
  check("invariants: a shared serial is a blocker", dupes.some((issue) => issue.code === "duplicate-serial"));
  const settledNoPrice = checkLines([item({ priceUsd: null, cashValueUsd: null })]);
  check("invariants: settled with no price is flagged", settledNoPrice.some((issue) => issue.code === "settled-no-price"));
  const stale = checkLines([item({ pricedAt: "2026-01-01T00:00:00.000Z" })], new Date("2026-10-29T00:00:00.000Z"));
  check("invariants: an old price is a stale-price note", stale.some((issue) => issue.code === "stale-price"));
}

// Evidence ranking: the biggest doubt for the least effort comes first.
{
  const pricey = item({ id: "tv", identitySettled: false, priceUsd: 2000, options: [
    { label: "Basic", lowUsd: 400, highUsd: 600 },
    { label: "Premium", lowUsd: 1800, highUsd: 2400 },
  ] });
  const cheap = item({ id: "mug", name: "Mug", identitySettled: false, priceUsd: 30, options: [] });
  const requests = openRequests(room([pricey, cheap]));
  check("ranking: requests are produced for unsettled lines", requests.length > 0);
  check("ranking: the expensive identity question outranks the cheap one", requests[0]?.itemId === "tv", requests[0]?.key ?? "none");
}

// Eval scorer: a wrong settled line is caught.
{
  const truth: TruthLine[] = [
    { name: "television", aliases: ["tv"], count: 1, brand: "Samsung", model: "QN65Q80C", replacementUsd: 1100 },
    { name: "dining chair", aliases: ["chair"], count: 4, brand: null, model: null, replacementUsd: 120 },
  ];
  const rooms = room([
    item({}),
    item({ id: "chairs", name: "Dining chair", itemType: "chair", count: 2, brand: null, markings: null, priceUsd: 120, valueBasis: "Comparable: dining chair" }),
  ]);
  const score = scoreRooms(truth, rooms);
  check("scorer: wrong count marked settled is caught", score.wrongButSettled >= 1, `wrongButSettled=${score.wrongButSettled}`);
  check("scorer: ratios stay within 0..1", [score.found, score.countRight].every((value) => value == null || (value >= 0 && value <= 1)));
}

// Label requests: never for a large item the video already shows, or when the likely models price alike.
{
  const options = [
    { label: "Basic", lowUsd: 3000, highUsd: 4000 },
    { label: "Premium", lowUsd: 7000, highUsd: 9000 },
  ];
  const hotTub = item({ name: "Hot tub", itemType: "hot tub", category: "other", identitySettled: false, options });
  check("labels: a hot tub is estimated from the video, not sent for a label", !labelWorthAsking(hotTub));
  const sofa = item({ name: "Sectional sofa", itemType: "sofa", category: "furniture", identitySettled: false, options });
  check("labels: furniture is not sent for a label", !labelWorthAsking(sofa));
  const close = item({ identitySettled: false, options: [{ label: "A", lowUsd: 900, highUsd: 1000 }, { label: "B", lowUsd: 950, highUsd: 1100 }] });
  check("labels: no label when the likely models price alike", !labelWorthAsking(close));
  const tv = item({ identitySettled: false, options: [{ label: "43 in", lowUsd: 250, highUsd: 350 }, { label: "75 in", lowUsd: 1200, highUsd: 1600 }] });
  check("labels: a TV whose models differ a lot still gets one", labelWorthAsking(tv));
  check("labels: a settled line never gets one", !labelWorthAsking({ ...tv, identitySettled: true }));
}

// Narration: the year said out loud becomes an age.
{
  const now = new Date("2026-10-29T00:00:00.000Z");
  check("age: a bought year becomes an age", ageFromSpeech({ boughtYear: 2019 }, now) === 7);
  check("age: '5 years old' becomes an age", ageFromSpeech({ age: "5 years old" }, now) === 5);
  check("age: a year in the narration counts", ageFromSpeech({ narration: "We got this hot tub in 2021" }, now) === 5);
  check("age: a stated age wins over a year", ageFromSpeech({ ageYears: 2, boughtYear: 2010 }, now) === 2);
  check("age: a template 0 does not hide the year they said", ageFromSpeech({ ageYears: 0, boughtYear: 2021 }, now) === 5);
  check("age: a future year is ignored", ageFromSpeech({ boughtYear: 2031 }, now) === null);
}

// Transcripts: control tags from the voice model never reach the list.
{
  check("transcript: tags are stripped", cleanTranscript("<|en|>Hot tub <|noise|>Jacuzzi brand") === "Hot tub Jacuzzi brand");
}

// A listing cut off mid-answer keeps the rooms that were complete.
{
  const cut = '{"rooms":[{"title":"Patio","items":[{"name":"Hot tub","count":1}]},{"title":"Garage","items":[{"name":"Dri';
  const salvaged = salvageRoomsJson(cut) as { rooms?: { title: string }[] } | null;
  check("salvage: a truncated listing keeps the finished room", salvaged?.rooms?.[0]?.title === "Patio", JSON.stringify(salvaged)?.slice(0, 80));
}

// Session: fifteen minutes for a scan, five more to add, two clips in flight, results in order.
{
  const full = advanceClock(blankClock(), SCAN_LIMIT_MS + 5000);
  check("session: a scan stops at fifteen minutes", full.clock.recordedMs === 15 * 60 * 1000 && full.close === "finish");
  const added = advanceClock(blankClock(), ADD_LIMIT_MS + 5000, ADD_LIMIT_MS);
  check("session: scan more stops at five minutes", added.clock.recordedMs === 5 * 60 * 1000 && added.close === "finish");
  check("pipeline: two clips go out at once", clipsToSend(5, new Set(), new Set()).join(",") === "0,1");
  check("pipeline: a finished clip frees a slot for the next", clipsToSend(5, new Set([0]), new Set([1])).join(",") === "2");
  check("pipeline: nothing over the limit", clipsToSend(5, new Set(), new Set([0, 1])).length === 0);
  const results = new Map<number, unknown>([[1, {}], [2, {}]]);
  check("pipeline: a later clip waits for an earlier one", readyInOrder(0, results).length === 0);
  results.set(0, {});
  check("pipeline: results apply in clip order", readyInOrder(0, results).join(",") === "0,1,2");
}

// Prices: a web price keeps the line's own depreciation share.
{
  const line = item({ id: "tub", priceUsd: 8000, cashValueUsd: 4000, depreciationNote: "Half its life used.", pricedAt: null });
  const priced = applyPrices({ rooms: room([line]) }, [{ key: "tub", replacementUsd: 10000, basis: "Comparable: 6-person hot tub", sourceUrl: null }], new Map([["tub", ["tub"]]]));
  const after = priced.rooms[0]?.items[0];
  check("prices: replacement set and cash keeps its share", after?.priceUsd === 10000 && after.cashValueUsd === 5000, `${after?.priceUsd}/${after?.cashValueUsd}`);
}

// Repeat check: the model proposes, the rules decide.
{
  const a = item({ id: "a", name: "Hot tub", category: "other", count: 1, brand: "Jacuzzi", sightings: [{ clipId: "c1", atSec: 3 }] });
  const b = item({ id: "b", name: "Spa", category: "other", count: 1, brand: null, markings: null, identitySettled: false, sightings: [{ clipId: "c4", atSec: 8 }] });
  const sameClip = item({ id: "c", name: "Spa cover", category: "other", sightings: [{ clipId: "c1", atSec: 9 }] });
  const chair = item({ id: "d", name: "Chair", category: "furniture", sightings: [{ clipId: "c5", atSec: 2 }] });
  const serialA = item({ id: "e", name: "Fridge", category: "appliance", serial: "S-1", sightings: [{ clipId: "c2", atSec: 1 }] });
  const serialB = item({ id: "f", name: "Fridge", category: "appliance", serial: "S-2", sightings: [{ clipId: "c3", atSec: 1 }] });
  const pairs = applyReconcile({ rooms: room([a, b, sameClip, chair, serialA, serialB]) }, {
    same: [["b", "a"], ["a", "c"], ["a", "d"], ["e", "f"]],
    rooms: [],
  });
  const ids = pairs.review.rooms.flatMap((entry) => entry.items.map((line) => line.id));
  check("repeat: the same object across clips becomes one line", !ids.includes("b") && pairs.joined === 1, `joined=${pairs.joined}`);
  check("repeat: the line with more evidence is kept", ids.includes("a"));
  check("repeat: two lines from one clip stay apart", ids.includes("c"));
  check("repeat: different categories stay apart", ids.includes("d"));
  check("repeat: two serials stay apart", ids.includes("e") && ids.includes("f"));
  const kept = pairs.review.rooms[0]?.items.find((line) => line.id === "a");
  check("repeat: the joined line records what it absorbed", kept?.changes.some((entry) => entry.after.sameObjectAs != null) ?? false);
  const counts = applyReconcile(
    { rooms: room([item({ id: "x", name: "Chair", category: "furniture", count: 2, sightings: [{ clipId: "c1", atSec: 1 }] }), item({ id: "y", name: "Chair", category: "furniture", count: 4, sightings: [{ clipId: "c2", atSec: 1 }] })]) },
    { same: [["x", "y"]], rooms: [] },
  );
  check("repeat: the count is the larger one, never the sum", counts.review.rooms[0]?.items[0]?.count === 4);
}

// Condition: damage lowers cash value, never replacement, and stays checkable.
{
  const worn = depreciate(1000, 5, 10, "good", { severity: "moderate" });
  check("damage: wear then damage set the cash value", worn.cash === 350, `${worn.cash}`);
  const noAge = depreciate(1000, null, 10, "damaged", { severity: "severe" });
  check("cash: with no age, cash value stays unknown and the damage waits for the age", noAge.cash === null && /damage/.test(noAge.note), `${noAge.cash}`);
  check("cash: no damage and no age is unknown, never replacement", depreciate(1000, null, 10, "good").cash === null);
  check("cash: a kind with no wear schedule keeps replacement, less damage", depreciate(1000, null, null, "good").cash === 1000 && depreciate(1000, null, null, "damaged", { severity: "minor" }).cash === 900);

  const listed = shapeWalkthrough(
    {
      rooms: [
        {
          title: "Living room",
          items: [
            { name: "Glass coffee table", category: "furniture", condition: "fair", damage: "cracked glass top", damageSeverity: "moderate", damageAtSec: 6, seenReplacementUsd: 400, ageYears: 2 },
            { name: "Sneakers", category: "shoes", likelyBrand: "Nike", brandClues: "partial swoosh on the side", seenReplacementUsd: 120 },
            { name: "Lamp", category: "other", likelyBrand: "IKEA", seenReplacementUsd: 150 },
            { name: "Speaker", category: "electronics", brand: "Sonos", likelyBrand: "Bose", brandClues: "shape", seenReplacementUsd: 450 },
          ],
        },
      ],
    },
    [],
    [],
  );
  const lines = listed.rooms.flatMap((entry) => entry.items);
  const table = lines.find((line) => line.name === "Glass coffee table");
  check(
    "damage: a damage note makes the line damaged and is kept with its second",
    table?.condition === "damaged" && table.damage?.severity === "moderate" && table.damage.atSec === 6,
  );
  check("damage: replacement stays the new price", table?.priceUsd === 400);
  check("damage: cash value is below replacement", (table?.cashValueUsd ?? 400) < 400, `${table?.cashValueUsd}`);
  check("brand: a likely brand is kept with its clues", lines.find((line) => line.name === "Sneakers")?.likelyBrand?.name === "Nike");
  check("brand: a likely brand without clues is dropped", lines.find((line) => line.name === "Lamp")?.likelyBrand == null);
  check("brand: a read brand wins over a likely one", lines.find((line) => line.name.includes("Speaker"))?.likelyBrand == null);

  const sofa = item({
    id: "sofa",
    name: "Sofa",
    category: "furniture",
    brand: null,
    markings: null,
    identitySettled: false,
    ageYears: 5,
    condition: "damaged",
    damage: { note: "torn cushion", severity: "moderate", clipId: null, atSec: 3 },
    priceUsd: null,
    cashValueUsd: null,
    depreciationNote: null,
    valueBasis: null,
    pricedAt: null,
  });
  const priced = applyPrices({ rooms: room([sofa]) }, [{ key: "sofa", replacementUsd: 2000, basis: "Exact: Ashley sofa", sourceUrl: null }], new Map([["sofa", ["sofa"]]]));
  const after = priced.rooms[0]?.items[0];
  check("damage: a web price on a damaged line takes the damage off cash", after?.priceUsd === 2000 && after.cashValueUsd === 700, `${after?.cashValueUsd}`);
  check("prices: an unconfirmed line is never priced as the exact product", after?.valueBasis?.startsWith("Comparable:") ?? false, after?.valueBasis ?? "");

  const first = item({ id: "chair", name: "Armchair", brand: null, markings: null, category: "furniture", ageYears: 4, priceUsd: 600, cashValueUsd: 360, condition: "good", damage: null });
  const later = item({ id: "chair-2", name: "Armchair", brand: null, markings: null, category: "furniture", condition: "damaged", damage: { note: "scratched arm", severity: "minor", clipId: "clip-2", atSec: 5 } });
  const merged = mergeRooms(room([first]), room([later]), "continue")[0]?.items[0];
  check("damage: damage seen in a later clip stays on the line", merged?.damage?.note === "scratched arm" && merged.condition === "damaged");
  check("damage: the later damage lowers cash value", (merged?.cashValueUsd ?? 360) < 360, `${merged?.cashValueUsd}`);

  const confirmed = applyPatch(item({ brand: null, likelyBrand: { name: "Nike", clues: "swoosh" } }), { brand: "Nike" });
  check("brand: a read brand clears the likely brand", confirmed?.likelyBrand == null && confirmed?.brand === "Nike");

  const blocker = checkLines([item({ condition: "damaged", damage: { note: "dent", severity: "minor", clipId: null, atSec: null }, cashValueUsd: 1100 })]);
  check("invariants: damage with no cash deduction is a blocker", blocker.some((issue) => issue.code === "damage-not-in-cash-value"));
  const exact = checkLines([item({ identitySettled: false })]);
  check("invariants: an exact price on an unconfirmed line is flagged", exact.some((issue) => issue.code === "exact-without-identity"));
  check("condition: undamaged stays good", asCondition("undamaged") === "good" && asCondition("no damage") === "good");
  check("condition: not new is not recorded as new", asCondition("not new") !== "new" && asCondition("brand new") === "new");
  check("condition: original packaging with no damage is new", asCondition("unopened original box") === "new" && asCondition("excellent") === "good");

  const chipped = shapeWalkthrough(
    { rooms: [{ title: "Kitchen", items: [{ name: "Mugs", category: "dishes", count: 4, condition: "damaged", damage: "chip on the rim", damageSeverity: "minor", seenReplacementUsd: 12 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  check(
    "damage: a grouped line keeps the price and does not invent one damage note",
    chipped?.grouped === true && chipped.damage == null && chipped.condition === "worn" && chipped.priceUsd === 12 && chipped.cashValueUsd == null,
    `${chipped?.condition} ${chipped?.cashValueUsd}`,
  );
  const lone = shapeWalkthrough(
    { rooms: [{ title: "Kitchen", items: [{ name: "Mug", category: "dishes", condition: "damaged", damage: "chip on the rim", damageSeverity: "minor", seenReplacementUsd: 12 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  check(
    "groups: one object is its own row and keeps its damage for the cash value",
    lone?.grouped === false && lone.damage != null && lone.cashValueUsd == null && /damage/.test(lone.depreciationNote ?? ""),
    `${lone?.grouped} ${lone?.cashValueUsd}`,
  );
  const dated = depreciate(12, 2, 10, lone?.condition ?? null, lone?.damage ?? null);
  check("groups: once the age is known, that one object's damage lowers its cash value", dated.cash != null && dated.cash < 12 * 0.8, `${dated.cash}`);

  const guessed = shapeWalkthrough(
    { rooms: [{ title: "Bedroom", items: [{ name: "Sneakers", category: "shoes", likelyBrand: "Nike", brandClues: "swoosh", identitySettled: true, seenReplacementUsd: 120 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  check("brand: a likely brand does not settle the model", guessed?.identitySettled === false && guessed?.likelyBrand?.name === "Nike");
  const brandOnly = shapeWalkthrough(
    { rooms: [{ title: "Kitchen", items: [{ name: "Range", category: "appliance", brand: "Cafe", identitySettled: true, seenReplacementUsd: 4000 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  const numbered = shapeWalkthrough(
    { rooms: [{ title: "Kitchen", items: [{ name: "Range", category: "appliance", brand: "Cafe", markings: "CGS700P2MS", seenReplacementUsd: 4000 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  check("identity: a brand without a model number is not settled", brandOnly?.identitySettled === false && brandOnly?.brand === "Cafe");
  check("identity: a model number settles the line", numbered?.identitySettled === true && numbered?.markings === "CGS700P2MS");
  const namedModel = shapeWalkthrough(
    { rooms: [{ title: "Kitchen", items: [{ name: "Cafe range", category: "appliance", brand: "Cafe", markings: "30-inch gas range", seenReplacementUsd: 4000 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  const mug = shapeWalkthrough(
    { rooms: [{ title: "Desk", items: [{ name: "Coffee mug with a drink", category: "other", itemType: "mug", description: "coffee in a mug", seenReplacementUsd: 4 }] }] },
    [],
    [],
  );
  const boxes = shapeWalkthrough(
    {
      rooms: [
        {
          title: "Garage",
          items: [
            { name: "Storage boxes", category: "other", itemType: "storage box", size: "medium", count: 4, seenReplacementUsd: 12 },
            { name: "Storage boxes", category: "other", itemType: "storage box", size: "large", count: 2, seenReplacementUsd: 18 },
          ],
        },
      ],
    },
    [],
    [],
  ).rooms[0]?.items ?? [];
  check("identity: a model name with the brand is enough", namedModel?.identitySettled === true && namedModel.markings === "30-inch gas range");
  check("property: a drink in a mug is not listed", mug.rooms.every((room) => room.items.length === 0));
  check("property: boxes of different sizes stay apart", boxes.length === 2 && boxes.some((line) => line.size === "medium" && line.count === 4));
  const decor = shapeWalkthrough(
    { rooms: [{ title: "Living room", items: [{ name: "Decor bowl", category: "other", itemType: "decor", count: 3, seenReplacementUsd: 12 }] }] },
    [],
    [],
  ).rooms[0]?.items ?? [];
  check("decor: each piece is its own line", decor.length === 3 && decor.every((line) => line.count === 1));
  const plates = shapeWalkthrough(
    {
      rooms: [
        {
          title: "Kitchen",
          items: [
            { name: "Dinner plates", category: "dishes", itemType: "dinner plates", count: 12, seenReplacementUsd: 8 },
            { name: "Wine glasses", category: "dishes", itemType: "wine glasses", count: 8, seenReplacementUsd: 6 },
            { name: "Sterling flatware set", category: "silverware", itemType: "sterling flatware", count: 1, seenReplacementUsd: 900 },
          ],
        },
      ],
    },
    [],
    [],
  ).rooms[0]?.items ?? [];
  check(
    "bulk: plates and glasses stay one counted line each, named Various",
    plates.length === 3 &&
      plates.some((line) => line.name === "Various dinner plates" && line.count === 12 && line.grouped) &&
      plates.some((line) => line.name === "Various wine glasses" && line.count === 8) &&
      plates.some((line) => line.name === "Sterling flatware set" && !line.grouped),
  );
  check("property: a coffee table is still listed", !isNotProperty("Coffee table", "table", "wood") && modelRecognized("Cafe", "30-inch gas range") && !modelRecognized("Samsung", null));
  {
  // The confidence ladder: one number per line, from the evidence an appraiser weighs.
  const page = "https://store.example/item";
  const closeUp = (after: ItemChange["after"]): ItemChange => ({ id: crypto.randomUUID(), at: "2026-11-01T00:00:00.000Z", source: "label photo", evidenceRef: null, before: {}, after });
  const agreed = (modelA: string | null, modelB: string | null) => ({
    result: "confirmed" as const,
    reads: [
      { kind: "appliance", brand: "Maker", model: modelA, evidence: "" },
      { kind: "appliance", brand: "Maker", model: modelB, evidence: "" },
    ],
    at: "",
    resolved: null,
  });
  const receiptLine = item({ userValueUsd: 900, sourceUrl: page, changes: [{ id: "c", at: "2026-11-01T00:00:00.000Z", source: "receipt photo", evidenceRef: null, before: {}, after: { userValueUsd: 900 } }] });
  const appraisalFile = { id: crypto.randomUUID(), name: "appraisal.pdf", path: "org/inv/appraisal.pdf", mediaType: "application/pdf", url: null };
  const appraised = item({ appraisalUsd: 5000, appraisalFileId: appraisalFile.id, files: [appraisalFile], priceUsd: 5000 });
  const typedAppraisal = item({ appraisalUsd: 5000, priceUsd: 1100, sourceUrl: page });
  check("confidence: a receipt that names the item is 99", lineConfidence(receiptLine).percent === 99 && lineConfidence(receiptLine).assessed);
  check(
    "confidence: an appraisal with its document is 99 and outranks a receipt",
    lineConfidence(appraised).percent === 99 && lineConfidence({ ...appraised, changes: receiptLine.changes }).tier === "appraised",
  );
  check(
    "confidence: a typed appraisal with no document is a stated price",
    !appraisalDocumented(typedAppraisal) && statedUsd(typedAppraisal) === 5000 && lineConfidence(typedAppraisal).percent === 50 && lineConfidence(typedAppraisal).label === "Your price disagrees",
  );
  const numbered = item({ sourceUrl: page, changes: [closeUp({ markings: "QN65Q80C" })] });
  check("confidence: a model number read from a label close-up and priced exact is 95", lineConfidence(numbered).percent === 95);
  check("confidence: a model number both reads agree on is 95", lineConfidence(item({ sourceUrl: page, identityCheck: agreed("QN65Q80C", "QN65Q80C") })).percent === 95);
  check("confidence: a confirmed model priced as a comparable is 90", lineConfidence({ ...numbered, valueBasis: "Comparable: Samsung 65-inch QLED" }).percent === 90);
  const namedPhone = item({ brand: "Apple", markings: "iPhone 17 Pro", priceUsd: 1199, sourceUrl: page, valueBasis: "Exact: Apple iPhone 17 Pro", changes: [closeUp({ markings: "iPhone 17 Pro" })] });
  check("confidence: a model name is 90, not a model number", lineConfidence(namedPhone).percent === 90 && !isModelNumber("iPhone 17 Pro"));
  check(
    "confidence: a size, capacity, resolution, or year is not a model number",
    !isModelNumber("65-inch") && !isModelNumber("12-cup") && !isModelNumber("4K") && !isModelNumber("2019") && !isModelNumber("Likely model CGS700P2MS") &&
      isModelNumber("CGS700P2MS") && isModelNumber("V435-J01") && isModelNumber("Vitamix 5200"),
  );
  check("confidence: a model number the walk read, with no close-up or second read, is not 95", (lineConfidence(item({ sourceUrl: page, priceUsd: 200 })).percent ?? 0) < 90);
  const guessedHigh = item({ brand: "Cafe", markings: "CGS700P2MS", detail: "Likely model from the description", identitySettled: false, priceUsd: 4000, sourceUrl: page, valueBasis: "Comparable: Cafe gas range" });
  check(
    "confidence: over $250, a model guessed by the text-only check is brand only, not counted",
    lineConfidence(guessedHigh).percent === 65 && !lineConfidence(guessedHigh).assessed && lineConfidence(guessedHigh).needsReceipt,
  );
  const readHigh = { ...guessedHigh, identityCheck: agreed(null, null) };
  check("confidence: two reads that agree raise that line to 85 and count it", lineConfidence(readHigh).percent === 85 && lineConfidence(readHigh).assessed);
  const smallBrand = item({ brand: "OXO", markings: "Good Grips salad spinner", detail: "Likely model", identitySettled: false, priceUsd: 40, sourceUrl: page, valueBasis: "Comparable: OXO" });
  check("confidence: under $250, a brand and a matching model is 85", lineConfidence(smallBrand).percent === 85 && lineConfidence(smallBrand).assessed);
  const lamp = item({ id: "lamp-line", brand: null, markings: null, identitySettled: false, priceUsd: 60, sourceUrl: page, valueBasis: "Comparable: table lamp" });
  check("confidence: an ordinary item under $250 priced from a page is 75 and counts", lineConfidence(lamp).percent === 75 && lineConfidence(lamp).assessed && lineConfidence(lamp).bar === 75);
  check("confidence: over $250 with nothing identifying is 40", lineConfidence({ ...lamp, priceUsd: 600 }).percent === 40 && lineConfidence({ ...lamp, priceUsd: 600 }).bar === 85);
  check("confidence: a brand alone over $250 is 65 and waits for a receipt", lineConfidence({ ...lamp, brand: "West Elm", priceUsd: 600 }).percent === 65 && lineConfidence({ ...lamp, brand: "West Elm", priceUsd: 600 }).needsReceipt);
  const unchecked = lineConfidence({ ...lamp, sourceUrl: null });
  check("confidence: a price no page backs is held at 60", unchecked.percent === 60 && unchecked.label === "Price not checked" && !unchecked.assessed);
  check("confidence: an open count is held at 70", lineConfidence({ ...smallBrand, countSettled: false }).percent === 70);
  const versions = item({ brand: "Apple", markings: null, identitySettled: false, priceUsd: 800, sourceUrl: page, options: [{ label: "iPhone 17 Pro", lowUsd: 1100, highUsd: 1200 }, { label: "iPhone 16", lowUsd: 800, highUsd: 900 }] });
  check("confidence: two possible versions are held at 50 and wait for a receipt", lineConfidence(versions).percent === 50 && lineConfidence(versions).needsReceipt);
  check(
    "confidence: a line stated and not seen has no percentage",
    lineConfidence(item({ enteredBy: "you", sourceUrl: page })).percent === null && lineConfidence(item({ detail: "Stated, not seen. Antique telephone.", sourceUrl: page })).tier === "stated",
  );
  const paid = { ...lamp, userValueUsd: 50 };
  check("price: inside half to double the stated price, the comparable is kept", !statedConflict(paid) && lineConfidence(paid).percent === 75);
  const farOff = { ...paid, priceUsd: 140 };
  check(
    "price: outside half to double, the line drops to 50 and asks",
    statedConflict(farOff) && lineConfidence(farOff).percent === 50 && openRequests(room([farOff])).some((request) => request.kind === "question" && /Which is closer/.test(request.prompt)),
  );
  check("price: a documented appraisal is the price; a typed one is not", pricedFrom(appraised, 9000).price === 5000 && pricedFrom(typedAppraisal, 9000).price === 9000);
  const relabeled = applyPatch(appraised, { priceUsd: 1200, valueBasis: "Exact: something else" });
  check("price: a later check never overwrites an appraised price", relabeled?.priceUsd === 5000 && relabeled.valueBasis === APPRAISAL_BASIS);
  // The list row: a name of at most 20 characters, one short badge, and a subtitle that never repeats the name.
  check("row: a short name is shown whole", shortName("Peloton bike") === "Peloton bike");
  check(
    "row: a long name is cut to 20 characters with an ellipsis, and a name of exactly 20 is not cut",
    shortName("TISSCARE foot and calf massager").length === 20 &&
      shortName("TISSCARE foot and calf massager").endsWith("…") &&
      shortName("12345678901234567890") === "12345678901234567890" &&
      shortName("123456789012345678901").length === 20,
  );
  check("row: extra spaces never push a name over 20", shortName("  small   entry    table  ") === "small entry table");
  check(
    "row: one badge, the percent or the state with no percent",
    chipText(lineConfidence(lamp)) === "75%" &&
      chipText(lineConfidence(receiptLine)) === "Receipt" &&
      chipText(lineConfidence(appraised)) === "Appraised" &&
      chipText(lineConfidence(item({ enteredBy: "you", sourceUrl: page }))) === "Stated",
  );
  check(
    "row: the subtitle is the brand and model, a likely brand, or the kind, and never the name again",
    rowSubtitle({ ...lamp, name: "Peloton bike", brand: "Peloton", markings: "Bike+", itemType: "bike" }) === "Peloton Bike+" &&
      rowSubtitle({ ...lamp, name: "Mirror", brand: null, markings: null, likelyBrand: { name: "Ethan Allen", clues: "label" }, itemType: "mirror" }) === "Likely Ethan Allen" &&
      rowSubtitle({ ...lamp, name: "Houseplant", brand: null, markings: null, likelyBrand: null, itemType: "houseplant" }) === "",
  );
  check(
    "one number: the chip, the ledger band, and the assessed total read the same confidence",
    bandOf(lamp) === "identified" &&
      bandOf({ ...lamp, priceUsd: 600 }) === "estimated" &&
      assessedReplacement([lamp, { ...lamp, id: "lamp-2", priceUsd: 600 }]) === 60 &&
      confidenceTone(lineConfidence(receiptLine)) === "verified" &&
      confidenceTone(lineConfidence(lamp)) === "settled" &&
      confidenceTone(lineConfidence(farOff)) === "unsure" &&
      accuracyMark(lamp).label === "75% · Class comparable",
  );
  }

  const pricedSofa = item({
    id: "sofa",
    name: "Sofa",
    brand: null,
    markings: null,
    identitySettled: false,
    category: "furniture",
    ageYears: null,
    usefulLifeYears: 10,
    condition: "good",
    damage: null,
    priceUsd: 1000,
    cashValueUsd: 1000,
    valueBasis: "Comparable: sofa",
    said: [],
    sightings: [{ clipId: "c1", atSec: 1 }],
  });
  const agedSofa = item({
    id: "sofa-2",
    name: "Sofa",
    brand: null,
    markings: null,
    identitySettled: false,
    category: "furniture",
    ageYears: 5,
    usefulLifeYears: 10,
    priceUsd: null,
    cashValueUsd: null,
    valueBasis: null,
    said: [],
    sightings: [{ clipId: "c2", atSec: 2 }],
  });
  const joinedSofa = applyReconcile({ rooms: room([pricedSofa, agedSofa]) }, { same: [["sofa", "sofa-2"]], rooms: [], fix: [] }).review.rooms[0]?.items[0];
  check("damage: an age from the other clip lowers cash value", joinedSofa?.ageYears === 5 && joinedSofa.cashValueUsd === 500, `${joinedSofa?.cashValueUsd}`);

  const placeholder = shapeWalkthrough(
    { rooms: [{ title: "Kitchen", items: [{ name: "Toaster", category: "appliance", condition: "good", damage: "none", damageSeverity: "minor", usefulLifeYears: 0, pricePaidUsd: 0, seenReplacementUsd: 0, ageYears: 0, boughtYear: 2021, options: [{ label: "", lowUsd: 0, highUsd: 0 }] }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  check(
    "listing: a template zero and a placeholder none do not drop or misprice the line",
    placeholder != null && placeholder.damage == null && placeholder.condition === "good" && placeholder.userValueUsd == null && placeholder.priceUsd == null && placeholder.ageYears === 5,
    `${placeholder?.ageYears} ${placeholder?.priceUsd} ${placeholder?.damage?.note}`,
  );

  const heardLater = item({
    id: "lamp",
    name: "Lamp",
    brand: null,
    markings: null,
    itemType: "lamp",
    category: "other",
    ageYears: null,
    usefulLifeYears: 8,
    condition: "good",
    damage: null,
    priceUsd: 200,
    cashValueUsd: 200,
    depreciationNote: "No age was clear, so depreciation was not taken. The cash value matches replacement.",
    valueBasis: "Comparable: lamp",
    said: [],
  });
  const withYear = item({
    id: "lamp-2",
    name: "Lamp",
    brand: null,
    markings: null,
    itemType: "lamp",
    category: "other",
    ageYears: 4,
    usefulLifeYears: 8,
    condition: "good",
    damage: null,
    priceUsd: null,
    cashValueUsd: null,
    valueBasis: null,
    said: [],
    sightings: [{ clipId: "c9", atSec: 2 }],
  });
  const lamp = mergeRooms(room([heardLater]), room([withYear]), "continue")[0]?.items[0];
  check("age: a year heard in a later clip lowers cash while filming", lamp?.ageYears === 4 && lamp.cashValueUsd === 100 && lamp.changes.some((entry) => entry.after.ageYears === 4), `${lamp?.cashValueUsd}`);

  const torn = item({
    id: "sofa",
    name: "Sofa",
    brand: null,
    markings: null,
    itemType: "sofa",
    identitySettled: false,
    category: "furniture",
    ageYears: 5,
    usefulLifeYears: 10,
    condition: "damaged",
    damage: { note: "torn arm", severity: "moderate", clipId: null, atSec: 2 },
    priceUsd: 1000,
    cashValueUsd: 350,
    depreciationNote: "damage already taken",
    valueBasis: "Comparable: sofa",
    said: [],
  });
  const named = item({
    id: "sofa-new",
    name: "Sofa",
    brand: "Ashley",
    markings: null,
    itemType: "sofa",
    identitySettled: true,
    category: "furniture",
    ageYears: null,
    condition: "good",
    damage: null,
    priceUsd: 2000,
    cashValueUsd: 2000,
    depreciationNote: "No age was clear, so depreciation was not taken. The cash value matches replacement.",
    valueBasis: "Exact: Ashley sofa",
    said: [],
  });
  const settled = mergeRooms(room([torn]), room([named]), "focus", ["sofa"])[0]?.items[0];
  check("damage: settling the brand keeps the damage off the new price", settled?.brand === "Ashley" && settled.priceUsd === 2000 && settled.cashValueUsd === 700, `${settled?.cashValueUsd}`);

  const longLife = item({
    id: "table",
    name: "Table",
    category: "furniture",
    ageYears: 10,
    usefulLifeYears: 20,
    condition: "good",
    damage: null,
    priceUsd: null,
    cashValueUsd: null,
    depreciationNote: null,
    valueBasis: null,
  });
  const longPriced = applyPrices({ rooms: room([longLife]) }, [{ key: "table", replacementUsd: 1000, basis: "Comparable: table", sourceUrl: null }], new Map([["table", ["table"]]])).rooms[0]?.items[0];
  check("prices: the line's own useful life is used", longPriced?.cashValueUsd === 500, `${longPriced?.cashValueUsd}`);
  check("damage: no damage is not a damage note", isBlankFact("no damage") && isBlankFact("none") && !isBlankFact("cracked glass"));

  const seenOnly = item({
    id: "est",
    name: "Sofa",
    brand: "Ashley",
    markings: null,
    itemType: "sofa",
    category: "furniture",
    identitySettled: true,
    priceUsd: 400,
    cashValueUsd: 400,
    depreciationNote: "Seen estimate.",
    pricedAt: null,
    valueBasis: "Seen in the walkthrough.",
    said: [],
    sightings: [{ clipId: "c1", atSec: 1 }],
  });
  const webChecked = item({
    id: "web",
    name: "Couch",
    brand: null,
    markings: null,
    itemType: "sofa",
    category: "furniture",
    identitySettled: false,
    priceUsd: 900,
    cashValueUsd: 900,
    depreciationNote: "Checked.",
    pricedAt: "2026-10-31T00:00:00.000Z",
    valueBasis: "Comparable: sofa",
    said: [],
    sightings: [{ clipId: "c2", atSec: 4 }],
  });
  const keptWeb = applyReconcile({ rooms: room([seenOnly, webChecked]) }, { same: [["est", "web"]], rooms: [], fix: [] }).review.rooms[0]?.items[0];
  check("prices: joining keeps the checked price, not the seen estimate", keptWeb?.priceUsd === 900 && keptWeb.pricedAt != null, `${keptWeb?.priceUsd}`);

  const checkedLamp = item({
    id: "lamp-a",
    name: "Lamp",
    brand: null,
    markings: null,
    itemType: "lamp",
    detail: "lamp",
    category: "other",
    priceUsd: 80,
    cashValueUsd: 80,
    depreciationNote: "Checked.",
    pricedAt: "2026-10-31T00:00:00.000Z",
    valueBasis: "Comparable: lamp",
    ageYears: null,
  });
  const again = item({
    id: "lamp-b",
    name: "Lamp",
    brand: null,
    markings: null,
    itemType: "lamp",
    detail: "lamp",
    category: "other",
    priceUsd: null,
    cashValueUsd: null,
    depreciationNote: null,
    pricedAt: null,
    valueBasis: null,
    ageYears: 4,
    usefulLifeYears: 8,
    condition: "good",
    damage: null,
  });
  const shared = shareKnownPrices({ rooms: room([checkedLamp, again]) }).rooms[0]?.items.find((line) => line.id === "lamp-b");
  check("prices: a repeat inherits the checked price and keeps its own age", shared?.priceUsd === 80 && shared.cashValueUsd === 40 && shared.pricedAt != null, `${shared?.cashValueUsd}`);
}

// Categories: the check at Done may fix a category, only to a listed one, and logs it.
{
  const tv = item({ id: "tv", category: "furniture", sightings: [{ clipId: "c1", atSec: 1 }] });
  const mug = item({ id: "mug", name: "Mug", category: "dishes", sightings: [{ clipId: "c1", atSec: 4 }] });
  const fixed = applyReconcile({ rooms: room([tv, mug]) }, { same: [], rooms: [], fix: [{ id: "tv", category: "electronics" }, { id: "mug", category: "kitchenware" }] });
  const lines = fixed.review.rooms.flatMap((entry) => entry.items);
  check("categories: a wrong category is fixed", lines.find((line) => line.id === "tv")?.category === "electronics" && fixed.fixed === 1);
  check("categories: a category not on the list is ignored", lines.find((line) => line.id === "mug")?.category === "dishes");
  check("categories: the fix is logged as the check", lines.find((line) => line.id === "tv")?.changes.some((entry) => entry.source === "check") ?? false);
  const agedTv = item({
    id: "aged-tv",
    category: "furniture",
    ageYears: 4,
    usefulLifeYears: 10,
    priceUsd: 1000,
    cashValueUsd: 600,
    condition: "good",
    damage: null,
    sightings: [{ clipId: "c1", atSec: 1 }],
  });
  const repriced = applyReconcile({ rooms: room([agedTv]) }, { same: [], rooms: [], fix: [{ id: "aged-tv", category: "electronics" }] }).review.rooms[0]?.items[0];
  check(
    "categories: a fix recomputes cash value on the new kind's life",
    repriced?.category === "electronics" && repriced.usefulLifeYears === 5 && repriced.cashValueUsd === 200,
    `${repriced?.usefulLifeYears} ${repriced?.cashValueUsd}`,
  );
}

// House study: a 2,600 sq ft walk, priced before any receipt, with jewelry left out of the $250 check.
{
  const sofa = item({ id: "sofa", name: "Sofa", category: "furniture", priceUsd: 480, sightings: [{ clipId: "c1", atSec: 4 }] });
  const lamp = item({ id: "lamp", name: "Lamp", category: "other", priceUsd: 40, changes: [{ id: "ch", at: "2026-11-01T00:00:00.000Z", source: "receipt photo", evidenceRef: null, before: {}, after: {} }], sightings: [{ clipId: "c1", atSec: 8 }] });
  const ghost = item({ id: "ghost", name: "Phantom chair", category: "furniture", priceUsd: 300, sightings: [{ clipId: "c2", atSec: 2 }] });
  const inventory = {
    rooms: room([sofa, lamp, ghost]),
    clips: [{ durationMs: 120_000 }, { durationMs: 60_000 }],
  } as Parameters<typeof scoreHouseWalk>[0];
  const score = scoreHouseWalk(inventory, [
    { name: "Sofa", count: 1, brand: null, model: null, replacementUsd: 400, category: "furniture", inVideo: true },
    { name: "Grill", count: 1, brand: null, model: null, replacementUsd: 300, category: "appliance", inVideo: true },
    { name: "Ring", count: 1, brand: null, model: null, replacementUsd: 800, category: "jewelry", inVideo: true },
    { name: "Lamp", count: 1, brand: null, model: null, replacementUsd: 40, category: "other", inVideo: true },
    { name: "Phantom chair", count: 1, brand: null, model: null, replacementUsd: 300, category: "furniture", inVideo: false },
  ]);
  check("study: filmed time is the clips", score.filmedMinutes === 3);
  check("study: a receipt price is not in the before-connections check", score.priceChecked === 1 && score.priceWithinBand === 1);
  check("study: a $300 grill that was not listed is missed, and a ring is not", score.missedOver250.join(",") === "Grill" && score.recoverChecked === 2);
  check("study: a visible item that is absent is missing", score.missing.includes("Grill") && score.missing.includes("Ring"));
  check("study: an item the video does not show is a false capture", score.falseCaptures.join(",") === "Phantom chair");
  check("study: two walks do not yet set a new-user time", newUserMinutes([12, 14]) === null);
  check("study: three walks set the average", newUserMinutes([12, 14, 16]) === 14 && HOUSE_STUDY.livingSqFt === 2600);
}

{
  const shared = [
    { roomTitle: "Living room", seenAt: [0] },
    { roomTitle: "Living room", seenAt: [0] },
    { roomTitle: "Living room", seenAt: [6] },
  ];
  clearSharedSightings(shared);
  check("frames: two lines that share the opening second do not keep it", shared[0]?.seenAt.length === 0 && shared[1]?.seenAt.length === 0);
  check("frames: a line with its own second keeps it", shared[2]?.seenAt[0] === 6);
}

{
  const kept = item({ id: "keep", name: "Sofa", priceUsd: 100, cashValueUsd: 80, hidden: false });
  const held = item({ id: "held", name: "Lamp", priceUsd: 500, cashValueUsd: 400, hidden: true });
  const report = { title: "House", homeAddress: "1 Main", addressRegion: "us", addressPoint: null, place: null, locationCheck: null, recordHash: null, items: [], clips: [], rooms: room([kept, held]) } as unknown as HomeInventory;
  const csv = inventoryCsv(report);
  check("report: a hidden line is left out of the total and the file", replacementTotal(report) === 100 && csv.includes("Sofa") && !csv.includes("Lamp"));
}

{
  // The hand-walked baseline from 2026-11-03 and the workbook's acceptance cases.
  const rooms = roomTotals();
  const low = EXPECTED.reduce((sum, entry) => sum + entry.ownerLowUsd, 0);
  const high = EXPECTED.reduce((sum, entry) => sum + entry.ownerHighUsd, 0);
  check("scorecard: 40 entries normalize to 60 units", EXPECTED.length === SCORECARD_BASELINE.entries && expectedUnits() === SCORECARD_BASELINE.units);
  check("scorecard: the seven counting rules are stated", COUNTING_RULES.length === 7 && SCORECARD_BASELINE.walkedOn === "2026-11-03");
  check("scorecard: owner totals match the workbook", low === SCORECARD_BASELINE.ownerTotalLowUsd && high === SCORECARD_BASELINE.ownerTotalHighUsd);
  check(
    "scorecard: room totals match the workbook",
    rooms.get("Front entrance")?.units === 17 && rooms.get("Bedroom 1")?.units === 19 && rooms.get("Hallway")?.units === 16 && rooms.get("Gym")?.units === 8,
  );
  const base = { duplicateUnits: 0, phantomUnits: 0, improperInclusionUnits: 0, unresolvedUnits: 0, notExposedUnits: 0, remindersOn: false };
  const perfect = scoreRun({ ...base, correct: allCorrect(), includedUnits: 60 });
  check("scorecard: 60 correct and no extras is 100% and PASS", perfect.status === "scored" && perfect.matchScore === 100 && perfect.result === "PASS");
  const improper = scoreRun({ ...base, correct: allCorrect(), improperInclusionUnits: 1, includedUnits: 61 });
  check("scorecard: one improper inclusion is 98.4%, capture 100%, needs work", improper.status === "scored" && improper.matchScore === 98.4 && improper.captureRate === 100 && improper.result === "Needs work");
  const oneMissing = scoreRun({ ...base, correct: { ...allCorrect(), 30: 0 }, includedUnits: 59 });
  check("scorecard: one missing is 98.3% and names the miss", oneMissing.status === "scored" && oneMissing.matchScore === 98.3 && oneMissing.missedIds.join(",") === "30");
  const missAndDup = scoreRun({ ...base, correct: { ...allCorrect(), 30: 0 }, duplicateUnits: 1, includedUnits: 60 });
  check("scorecard: one missing plus one duplicate is 96.7%", missAndDup.status === "scored" && missAndDup.matchScore === 96.7);
  const pending = scoreRun({ ...base, correct: allCorrect(), unresolvedUnits: 1, includedUnits: 60 });
  check("scorecard: an unresolved decision withholds the score", pending.status === "pending");
  const unreconciled = scoreRun({ ...base, correct: allCorrect(), includedUnits: 61 });
  check("scorecard: an included count that does not reconcile is rejected", unreconciled.status === "invalid");
  const over = scoreRun({ ...base, correct: { ...allCorrect(), 6: 6 }, includedUnits: 61 });
  check("scorecard: crediting above the target is rejected", over.status === "invalid");
  const empty = scoreRun({ ...base, correct: {}, includedUnits: 0 });
  check("scorecard: an empty output is 0% with no precision", empty.status === "scored" && empty.matchScore === 0 && empty.precision === null && empty.falseNegatives === 60);

  // The research series: five scored walks, then an average. Variance is how far the walks drift.
  const miss = (ids: number[]) => {
    const correct = allCorrect();
    for (const id of ids) correct[id] = 0;
    return scoreRun({ ...base, correct, includedUnits: 60 - ids.length });
  };
  const at95 = miss([1, 2, 4]);
  const at90 = miss([1, 2, 4, 5, 7, 8]);
  check("series: three misses on this list is the 95 line", at95.status === "scored" && at95.matchScore === 95);
  check("series: the bar is five runs at 95, with variance at most 4", RESEARCH_SERIES.runs === 5 && RESEARCH_SERIES.target === 95 && RESEARCH_SERIES.maxVariance === 4);
  const four = scoreSeries([perfect, perfect, perfect, perfect]);
  check("series: four scored runs state no rate", four.status === "incomplete" && four.recorded === 4 && !("average" in four));
  const steady = scoreSeries([at95, at95, at95, at95, at95]);
  check("series: five runs at 95 average 95 and agree", steady.status === "recorded" && steady.average === 95 && steady.variance === 0 && steady.result === "meets target");
  const outlier = scoreSeries([at95, at95, at95, at95, perfect]);
  check(
    "series: one perfect run among 95s is recorded, and the walks do not agree",
    outlier.status === "recorded" && outlier.average === 96 && outlier.variance === 5 && outlier.spread === 5 && outlier.atTarget && !outlier.consistent && outlier.result === "inconsistent",
  );
  const below = scoreSeries([at90, at90, at90, at90, at90]);
  check("series: five runs at 90 agree, and stay below the target", below.status === "recorded" && below.average === 90 && below.variance === 0 && below.consistent && below.result === "below target");
  const split = scoreSeries([at90, at90, at90, perfect, perfect]);
  check("series: a 90 and a 100 do not average into a stable rate", split.status === "recorded" && split.average === 94 && split.variance === 30 && split.result === "below target and inconsistent");
  const held = scoreSeries([perfect, perfect, perfect, perfect, pending]);
  check("series: an unresolved run withholds the rate", held.status === "withheld");
  const withReminders = scoreRun({ ...base, remindersOn: true, correct: allCorrect(), includedUnits: 60 });
  check("series: the reminders checkbox is kept with the run", withReminders.status === "scored" && withReminders.remindersOn && perfect.status === "scored" && !perfect.remindersOn);
  const mixed = scoreSeries([perfect, perfect, perfect, perfect, withReminders]);
  check("series: five runs must share one reminder setting", mixed.status === "invalid");
  const allOn = scoreSeries([withReminders, withReminders, withReminders, withReminders, withReminders]);
  check("series: the series records its reminder setting", allOn.status === "recorded" && allOn.remindersOn && steady.status === "recorded" && !steady.remindersOn);
  const extra = scoreSeries([perfect, perfect, perfect, perfect, perfect, perfect]);
  check("series: a sixth run is a new series, not a replacement", extra.status === "invalid");
}

{
  // Test 1A put most lines in "Walkthrough". A tapped room decides where a line goes.
  const markers = [
    { atMs: 0, room: "Front entrance" },
    { atMs: 18_000, room: "Primary bedroom" },
  ];
  check("rooms: the four demo starters come first, the rest are under More", DEMO_ROOMS.join("|") === "Front entrance|Primary bedroom|Hallway|Gym" && MORE_ROOMS.length === 7);
  check("rooms: a line takes the room tapped at its second", roomAt(markers, 5) === "Front entrance" && roomAt(markers, 18) === "Primary bedroom" && roomAt(markers, 29) === "Primary bedroom");
  check("rooms: before the first tap, the first tapped room", roomAt([{ atMs: 6000, room: "Gym" }], 2) === "Gym" && roomAt([], 2) === null);
  check("rooms: Walkthrough is not a room", foldRoomTitle("Walkthrough") === ROOM_NOT_SET && foldRoomTitle("walkthrough 2") === ROOM_NOT_SET);
  check(
    "rooms: a closet folds into its room",
    foldRoomTitle("Primary closet") === "Primary bedroom" && foldRoomTitle("Master bedroom closet") === "Primary bedroom" && foldRoomTitle("Hall closet") === "Hallway",
  );
  check("rooms: plain names keep their title, clear aliases map to the seed", foldRoomTitle("Entry") === "Front entrance" && foldRoomTitle("Kitchen") === "Kitchen" && foldRoomTitle("Bedroom") === "Bedroom");
  check("rooms: markers are validated", !roomMarkersSchema.safeParse([{ atMs: -1, room: "Gym" }]).success && roomMarkersSchema.safeParse(markers).success);
  const placed = shapeWalkthrough(
    {
      rooms: [
        {
          title: "Walkthrough",
          items: [
            { name: "Entry table", category: "furniture", itemType: "console table", count: 1, seenAtSec: 4, seenReplacementUsd: 300 },
            { name: "Dresser", category: "furniture", itemType: "dresser", count: 1, seenAtSec: 22, seenReplacementUsd: 350 },
          ],
        },
      ],
    },
    [],
    [],
    "video",
    markers,
  );
  const roomOf = (name: string) => placed.rooms.find((entry) => entry.items.some((line) => line.name === name))?.title;
  check("rooms: one clip across two rooms lands each line in its tapped room", roomOf("Entry table") === "Front entrance" && roomOf("Dresser") === "Primary bedroom" && !placed.rooms.some((entry) => entry.title === "Walkthrough"));
  const untapped = shapeWalkthrough({ rooms: [{ title: "Walkthrough", items: [{ name: "Lamp", category: "furniture", itemType: "lamp", count: 1, seenReplacementUsd: 40 }] }] }, [], []);
  check("rooms: with no tap, an unclear room is Room not set", untapped.rooms[0]?.title === ROOM_NOT_SET);

  // A room change with no tap is asked about, never applied by itself.
  const bedroomOnly = [{ atMs: 0, room: "Primary bedroom" }];
  const saidGym = roomChangeHint({ rooms: [{ title: "Primary bedroom", items: [{ seenAtSec: 3 }] }], roomChange: { room: "home gym", atSec: 14 } }, bedroomOnly);
  check("room hint: the listing's room change is asked about", saidGym?.room === "Gym" && saidGym.atSec === 14);
  const listedGym = roomChangeHint({ rooms: [{ title: "Primary bedroom", items: [{ seenAtSec: 3 }] }, { title: "Gym", items: [{ seenAtSec: 20 }, { seenAtSec: 25 }] }] }, bedroomOnly);
  check("room hint: lines listed in another room raise it at their first second", listedGym?.room === "Gym" && listedGym.atSec === 20);
  check(
    "room hint: a looser name for the tapped room is not a reason to ask",
    roomChangeHint({ rooms: [{ title: "Bedroom", items: [{ seenAtSec: 4 }] }, { title: "Walkthrough", items: [{ seenAtSec: 9 }] }] }, bedroomOnly) === null,
  );
  check("room hint: no tap, no prompt", roomChangeHint({ rooms: [{ title: "Gym", items: [{ seenAtSec: 4 }] }] }, []) === null);
  const sightedAt = (id: string, clipId: string, atSec: number) => item({ id, name: id, sightings: [{ clipId, atSec }] });
  const beforeMove = {
    rooms: [
      { id: crypto.randomUUID(), title: "Primary bedroom", items: [sightedAt("Dresser", "c4", 5), sightedAt("Bench", "c4", 20), item({ id: "Rack", name: "Rack", sightings: [{ clipId: "c4", atSec: 22 }, { clipId: "c5", atSec: 3 }] })] },
    ],
  };
  const afterMove = moveClipLines(beforeMove, "c4", 14, "Primary bedroom", "Gym");
  const titleOf = (name: string) => afterMove.review.rooms.find((entry) => entry.items.some((line) => line.name === name))?.title;
  check(
    "room hint: yes moves that clip's later lines only; a line seen in another clip stays",
    afterMove.moved === 1 && titleOf("Bench") === "Gym" && titleOf("Dresser") === "Primary bedroom" && titleOf("Rack") === "Primary bedroom",
  );

  // Room-prefixed names from the earlier-clips hint, and placeholder words.
  check("names: a room prefix is stripped", cleanItemName("Walkthrough: wall mirror") === "Wall mirror" && cleanItemName("Bedroom: queen bed", ["Bedroom"]) === "Queen bed");
  check("names: a room word inside the name is stripped and the brand stays", cleanItemName("Honeywell Walkthrough: tower fan") === "Honeywell tower fan");
  check("names: placeholder words are stripped", cleanItemName("Unspecified size not clear clogs") === "Clogs");
  check("names: a clean name is left alone", cleanItemName("iPhone 15 Pro") === "iPhone 15 Pro" && cleanItemName("Model 3: charger") === "Model 3: charger");
  const prefixed = shapeWalkthrough(
    { rooms: [{ title: "Walkthrough", items: [{ name: "Walkthrough: wall mirror", category: "furniture", itemType: "mirror", count: 1, seenReplacementUsd: 120 }] }] },
    [],
    [],
  );
  check("names: a new listing never keeps a room prefix", prefixed.rooms[0]?.items[0]?.name === "Wall mirror");

  // One clip listing one object under two rooms, both placed in the tapped room.
  const twice = shapeWalkthrough(
    {
      rooms: [
        { title: "Walkthrough", items: [{ name: "Tower fan", category: "appliance", itemType: "tower fan", brand: "Honeywell", count: 1, seenAtSec: 6, seenReplacementUsd: 60 }] },
        { title: "Bedroom", items: [{ name: "Tower fan", category: "appliance", itemType: "tower fan", brand: "Honeywell", count: 1, seenAtSec: 12, seenReplacementUsd: 60 }] },
      ],
    },
    [],
    [],
    "video",
    bedroomOnly,
  );
  const fans = twice.rooms.flatMap((entry) => entry.items).filter((line) => /tower fan/i.test(line.name));
  check("rooms: the same object under two rooms in one clip is one line, not a count of two", fans.length === 1 && fans[0]?.count === 1);
  const pair = shapeWalkthrough(
    { rooms: [{ title: "Gym", items: [{ name: "Dumbbell", category: "other", itemType: "dumbbell", count: 1, seenAtSec: 2 }, { name: "Dumbbell", category: "other", itemType: "dumbbell", count: 1, seenAtSec: 4 }] }] },
    [],
    [],
  );
  check("rooms: two listings in the same room still add up", pair.rooms[0]?.items.reduce((sum, line) => sum + line.count, 0) === 2);

  check("clips: a clip is labeled by the rooms tapped in it", clipRoomLabel([{ atMs: 9000, room: "Gym" }, { atMs: 0, room: "Hallway" }, { atMs: 12_000, room: "Gym" }]) === "Hallway, Gym" && clipRoomLabel(undefined) === "");

  check("reliability: clip 30 of a 15-minute scan is never read as clip 1", CLIP_NUMBER_LIMIT >= SCAN_LIMIT_MS / 30_000 + ADD_LIMIT_MS / 30_000);

  // Nothing the person tapped or answered is lost between the camera, Done, and the save.
  const folds = withoutTappedFolds({ rooms: [{ from: "Hallway", to: "Front entrance" }, { from: "Room not set", to: "Gym" }] }, ["Hallway", "Gym"]);
  check("reliability: the repeat check never folds a tapped room away", folds.rooms.length === 1 && folds.rooms[0]?.from === "Room not set");
  check("reliability: a yes adds the room to that clip's taps", withMarker([{ atMs: 0, room: "Primary bedroom" }], 14_000, "Gym").map((marker) => marker.room).join(",") === "Primary bedroom,Gym");

  const lineA = item({ id: crypto.randomUUID(), name: "Sofa", sightings: [{ clipId: "c1", atSec: 3 }] });
  const lineB = item({ id: crypto.randomUUID(), name: "Lamp", sightings: [{ clipId: "c1", atSec: 9 }] });
  const saved = [{ id: crypto.randomUUID(), title: "Living room", items: [item({ id: crypto.randomUUID(), name: "Rug" })] }];
  const scanMore = [{ id: crypto.randomUUID(), title: "Living room", items: [lineA, lineB] }];
  const appended = mergeRooms(saved, scanMore, "append");
  const edited = appended.map((entry) => ({
    ...entry,
    items: entry.items.filter((line) => line.id !== lineB.id).map((line) => (line.id === lineA.id ? { ...line, hidden: true } : line)),
  }));
  const stamped = [{ ...scanMore[0]!, items: [{ ...lineA, photoPath: "a/b/sofa.jpg", photoUrl: "blob:sofa" }, lineB] }];
  const refreshed = mergeRooms(edited, stamped, "refresh").flatMap((entry) => entry.items);
  check("reliability: the second save after stills adds no duplicate lines", refreshed.length === 2 && refreshed.filter((line) => line.id === lineA.id).length === 1);
  check("reliability: a line deleted while the scan finished stays deleted", !refreshed.some((line) => line.id === lineB.id));
  check("reliability: a line hidden while the scan finished stays hidden and gets its still", refreshed.find((line) => line.id === lineA.id)?.hidden === true && refreshed.find((line) => line.id === lineA.id)?.photoPath === "a/b/sofa.jpg");

  const clipId = crypto.randomUUID();
  const question = { id: crypto.randomUUID(), clipId, clip: 4, atSec: 14, room: "Gym", tapped: "Primary bedroom" };
  check("reliability: a waiting room question is validated", roomQuestionSchema.safeParse(question).success && !roomQuestionSchema.safeParse({ ...question, room: "" }).success);
  const roundTrip: HomeInventory = {
    id: crypto.randomUUID(),
    number: 1,
    title: "Test",
    homeAddress: "1 Main",
    addressRegion: "us",
    addressPoint: null,
    place: null,
    locationCheck: null,
    savedVersion: 0,
    loaded: true,
    createdAt: new Date().toISOString(),
    coverUrl: "",
    recordHash: null,
    sealedAt: null,
    rooms: [],
    clips: [
      {
        id: clipId,
        startedAt: new Date().toISOString(),
        durationMs: 30_000,
        posterUrl: "",
        videoUrl: "",
        mediaType: "video/mp4",
        sourceKept: true,
        contentHash: "a".repeat(64),
        storagePath: null,
        posterPath: null,
        spoken: [],
        rooms: [{ atMs: 0, room: "Primary bedroom" }],
      },
    ],
    items: [],
    roomQuestions: [question],
  };
  const request = toSaveRequest(roundTrip, []);
  const reloaded = request
    ? fromLoaded({
        id: roundTrip.id,
        title: request.title,
        region: request.region,
        address: request.address,
        version: 1,
        recordHash: null,
        sealedAt: null,
        createdAt: roundTrip.createdAt,
        document: { ...request.document, clips: request.document.clips.map((clip) => ({ ...clip, videoUrl: "", posterUrl: "" })) },
      })
    : null;
  check(
    "reliability: room taps and a waiting question survive save and reload",
    reloaded?.clips[0]?.rooms?.[0]?.room === "Primary bedroom" && reloaded.roomQuestions?.[0]?.room === "Gym",
  );

  // A line saved before the cleanup opens with the same name a new line would get.
  const oldLines = [
    item({ id: crypto.randomUUID(), name: "Walkthrough: wall mirror", itemType: "Walkthrough: wall mirror" }),
    item({ id: crypto.randomUUID(), name: "Honeywell Walkthrough: tower fan", itemType: "tower fan" }),
    item({ id: crypto.randomUUID(), name: "Bedroom: queen bed", itemType: "bed" }),
    item({ id: crypto.randomUUID(), name: "Unspecified size not clear clogs", itemType: "clogs" }),
    item({ id: crypto.randomUUID(), name: "iPhone 15 Pro", itemType: "phone" }),
  ];
  const opened = cleanRoomNames([{ id: crypto.randomUUID(), title: "Bedroom", items: oldLines }]);
  const openedNames = opened[0]?.items.map((line) => line.name).join("|");
  check(
    "names: saved lines open without a room or placeholder in the name",
    openedNames === "Wall mirror|Honeywell tower fan|Queen bed|Clogs|iPhone 15 Pro",
    openedNames ?? "",
  );
  check("names: a saved kind loses its room prefix too", opened[0]?.items[0]?.itemType === "Wall mirror");
  check("names: opening twice changes nothing more", cleanRoomNames(opened)[0]?.items.map((line) => line.name).join("|") === openedNames);
  const newLine = shapeWalkthrough(
    { rooms: [{ title: "Bedroom", items: [{ name: "Bedroom: queen bed", category: "furniture", itemType: "bed", count: 1, seenReplacementUsd: 300 }] }] },
    [],
    [],
  ).rooms[0]?.items[0]?.name;
  check("names: a saved line and a new line get the same name", newLine === opened[0]?.items[2]?.name);
}

{
  // Test 1A listed the console, the TV, and the dresser twice: once under "Walkthrough", once in the bedroom.
  const seen = (id: string, name: string, clipId: string, patch: Partial<RoomItem> = {}) =>
    item({
      id,
      name,
      brand: null,
      markings: null,
      serial: null,
      valueBasis: null,
      identitySettled: false,
      said: [],
      color: null,
      category: "furniture",
      itemType: name.toLowerCase(),
      detail: "",
      sightings: [{ clipId, atSec: 5 }],
      ...patch,
    });
  const consoleA = seen("console-a", "TV console", "c4", { detail: "TV console, white distressed base with dark wood top, open shelves", priceUsd: 514.07 });
  const consoleB = seen("console-b", "TV stand", "c6", { detail: "white wood TV stand with dark wood top, open shelves", priceUsd: 514.07 });
  const tvA = seen("tv-a", "Vizio TV", "c4", { brand: "VIZIO", category: "electronics", itemType: "flat-screen tv", detail: "flat-screen TV, black", color: "black" });
  const tvB = seen("tv-b", "Flat-screen TV", "c6", { category: "electronics", itemType: "flat-screen tv", detail: "flat-screen TV on stand", photoUrl: "blob:tv", photoPath: "o/i/tv.jpg" });
  const dresserA = seen("dresser-a", "Dresser", "c5", { detail: "tall dark brown wood double-door dresser with barn-style doors", color: "dark brown" });
  const dresserB = seen("dresser-b", "Wardrobe cabinet", "c7", { detail: "tall dark brown wood two-door wardrobe cabinet with barn-style doors", color: "brown" });
  const lampA = seen("lamp-a", "Table lamp", "c2", { detail: "small table lamp, white shade" });
  const lampB = seen("lamp-b", "Table lamp", "c8", { detail: "small table lamp on nightstand" });
  const rooms1a: RoomShard[] = [
    { id: crypto.randomUUID(), title: "Walkthrough", items: [consoleA, tvA, dresserA, lampA] },
    { id: crypto.randomUUID(), title: "Bedroom", items: [consoleB, tvB, dresserB, lampB] },
  ];
  const pairs1a = repeatPairs(rooms1a);
  const pairOf = (id: string) => pairs1a.find((pair) => pair.aId === id || pair.bId === id);
  check("repeats: the console and the TV stand in two rooms are one object", pairOf("console-a")?.sure === true && [pairOf("console-a")?.aId, pairOf("console-a")?.bId].includes("console-b"));
  check("repeats: a branded TV and an unbranded TV that match are one object", pairOf("tv-a")?.sure === true);
  check("repeats: a dresser and a wardrobe cabinet that match are one object", pairOf("dresser-a")?.sure === true);
  check("repeats: two lamps are asked about, never merged by themselves", pairOf("lamp-a")?.sure === false);
  check("repeats: two brands are two objects", compareLines(tvA, { ...tvB, brand: "TCL" }) === null);
  check("repeats: black and white are two objects", compareLines(tvA, { ...tvB, color: "white" }) === null);
  check("repeats: two models are two objects", compareLines({ ...tvA, markings: "V435" }, { ...tvB, markings: "M50Q7" }) === null);
  check("repeats: two lines from one clip are two objects", compareLines(consoleA, { ...consoleB, sightings: [{ clipId: "c4", atSec: 20 }] }) === null);
  const sureIds = pairs1a.filter((pair) => pair.sure).map((pair) => [pair.aId, pair.bId]);
  const merged1a = applyReconcile({ rooms: rooms1a }, { same: sureIds, rooms: [] }).review;
  const allLines = merged1a.rooms.flatMap((room) => room.items);
  const keptTv = allLines.find((line) => line.id === "tv-a" || line.id === "tv-b");
  check("repeats: after the check, eight lines are five", allLines.length === 5, String(allLines.length));
  check("repeats: the merged TV keeps the brand and the photo, and says where else it was seen", keptTv?.brand === "VIZIO" && keptTv.photoPath === "o/i/tv.jpg" && /Also seen in (Bedroom|Walkthrough)\./.test(keptTv.detail));
  const asked = repeatQuestions(merged1a.rooms, repeatPairs(merged1a.rooms));
  check("repeats: the unsure pair becomes a question with both rooms", asked.length === 1 && asked[0]?.aRoom !== asked[0]?.bRoom && asked[0]?.aName === "Table lamp");
  const answered = joinRepeatPair(merged1a, "lamp-a", "lamp-b");
  check("repeats: a yes merges the asked pair", answered.joined && answered.review.rooms.flatMap((room) => room.items).length === 4);
  const sculptures: RoomShard[] = [
    { id: crypto.randomUUID(), title: "Hallway", items: [seen("s1", "Gold starburst sculpture", "c3", { category: "art" }), seen("s2", "Gold starburst sculpture 2", "c3", { category: "art" })] },
    { id: crypto.randomUUID(), title: "Front entrance", items: [seen("s3", "Starburst shelf sculpture", "c1", { category: "art" })] },
  ];
  const sculpturePairs = repeatPairs(sculptures);
  check("repeats: a line is in one question at most, and decor is never merged by itself", sculpturePairs.length === 1 && sculpturePairs.every((pair) => !pair.sure));
  // Scan more: the new walk against what is saved. Saved lines are not paired with each other again.
  const savedRooms: RoomShard[] = [{ id: crypto.randomUUID(), title: "Primary bedroom", items: [consoleA, lampA, { ...lampB, id: "lamp-saved-2" }] }];
  const walkedAgain: RoomShard[] = [{ id: crypto.randomUUID(), title: "Primary bedroom", items: [{ ...consoleB, sightings: [{ clipId: "new-1", atSec: 4 }] }] }];
  const again = crossPairs(savedRooms, walkedAgain);
  check("repeats: a Scan more line that matches a saved line is paired with it", again.length === 1 && again[0]?.aId === "console-a" && again[0]?.sure === true);
  check("repeats: two saved lines are never paired again by a Scan more walk", !again.some((pair) => pair.aId.startsWith("lamp") && pair.bId.startsWith("lamp")));
  const massagers = joinSurePairs(
    {
      rooms: [
        {
          id: crypto.randomUUID(),
          title: "Gym",
          items: [
            seen("m1", "TISSCARE foot massager", "c9", { brand: "TISSCARE", category: "other", itemType: "foot massager", detail: "black electric foot and leg massager with digital display" }),
            seen("m2", "Foot massager", "c10", { category: "appliance", itemType: "foot massager", detail: "black electric foot massager with digital display and buttons" }),
          ],
        },
      ],
    },
    [{ aId: "m1", bId: "m2" }],
  );
  check("repeats: a sure match merges even when one line is filed as other", massagers.joined === 1 && massagers.review.rooms[0]?.items[0]?.brand === "TISSCARE");
  check("repeats: a pair is the same pair in either order", pairKey("a", "b") === pairKey("b", "a"));
  check(
    "repeats: the photo comparison is advice with a typed shape",
    repeatQuestionSchema.safeParse({ ...asked[0], check: { verdict: "same", reason: "Same carved frame.", cues: ["carved frame"] } }).success &&
      !repeatQuestionSchema.safeParse({ ...asked[0], check: { verdict: "merge", reason: "", cues: [] } }).success,
  );
  check(
    "repeats: the comparison is worded as advice, never as a decision",
    /look like the same object/.test(verdictText({ verdict: "same", reason: "", cues: [] }, false)) &&
      /could not tell/.test(verdictText({ verdict: "unsure", reason: "", cues: [] }, false)) &&
      /comparing/.test(verdictText(null, true)) &&
      verdictText(null, false) === "",
  );
  check(
    "repeats: a listing's numbered twins are two objects",
    compareLines(seen("v1", "Decorative bottle vase", "c2", { category: "other" }), seen("v2", "Decorative bottle vase 2", "c3", { category: "other" })) === null,
  );
}

{
  // Read twice: two independent reads of a line over $250. Agreement confirms; disagreement is shown, not guessed.
  const read = (kind: string, brand: string | null, model: string | null) => ({ kind, brand, model, evidence: "seen" });
  check("read twice: two matching reads confirm", compareReads(read("flat-screen TV", "VIZIO", null), read("TV", "Vizio", null)) === "confirmed");
  check("read twice: two brands are unsure", compareReads(read("TV", "VIZIO", null), read("TV", "TCL", null)) === "unsure");
  check("read twice: a brand only one read saw is unsure", compareReads(read("TV", "VIZIO", null), read("TV", null, null)) === "unsure");
  check("read twice: two kinds are unsure", compareReads(read("power rack", "Fitness Gear", null), read("weight bench", "Fitness Gear", null)) === "unsure");
  check("read twice: a model only one read saw stays open, not a conflict", compareReads(read("TV", "VIZIO", "V435-J01"), read("TV", "VIZIO", null)) === "confirmed");
  check("read twice: two models are unsure", compareReads(read("TV", "VIZIO", "V435"), read("TV", "VIZIO", "M50Q7")) === "unsure");
  check("read twice: one failed read is read once, never confirmed", compareReads(read("TV", "VIZIO", null), null) === "single");
  const tv = item({ id: crypto.randomUUID(), name: "Flat-screen TV", brand: null, markings: null, identitySettled: false, priceUsd: 322, valueBasis: null, said: [] });
  check("read twice: a line over $250 is read, a $100 line is not", needsReadTwice(tv) && !needsReadTwice({ ...tv, priceUsd: 100 }));
  const at = new Date().toISOString();
  const unsure = withIdentityCheck({ ...tv, identitySettled: true }, { result: "unsure", reads: [read("TV", "VIZIO", null), read("TV", "TCL", null)], at, resolved: null });
  check("read twice: unsure leaves identity open and keeps both reads", !unsure.identitySettled && unsure.identityCheck?.reads.length === 2 && readsDisagree(unsure));
  check("read twice: an unsure line is never at 90 or 95", (lineConfidence({ ...unsure, brand: "VIZIO", markings: "V435", identitySettled: true }).percent ?? 0) < 90);
  const confirmed = withIdentityCheck(tv, { result: "confirmed", reads: [read("TV", "VIZIO", null), read("TV", "Vizio", null)], at, resolved: null });
  check("read twice: agreement fills an empty brand and logs it as the check", confirmed.brand === "VIZIO" && confirmed.changes.some((entry) => entry.source === "check" && entry.after.brand === "VIZIO"));
  check("read twice: agreement alone never settles the model", !confirmed.identitySettled);
  const picked = resolveIdentity(unsure, "b");
  check("read twice: the owner's pick is applied and logged as their edit", picked.brand === "TCL" && !readsDisagree(picked) && picked.changes.some((entry) => entry.source === "your edit"));
  const summary = readTwiceSummary([{ id: crypto.randomUUID(), title: "Bedroom", items: [confirmed, unsure, { ...tv, id: crypto.randomUUID() }] }]);
  check("read twice: the list says how many were read, agreed, and unsure", summary.read === 2 && summary.agreed === 1 && summary.unsure === 1);
  check("read twice: a saved check is validated", identityCheckSchema.safeParse(unsure.identityCheck).success && !identityCheckSchema.safeParse({ ...unsure.identityCheck, reads: [] }).success);
}

{
  // Proof ledger: the total split by what backs each line. Each line is in exactly one band.
  const base = { brand: "VIZIO", markings: "V435", identitySettled: true, countSettled: true, said: [], valueBasis: null, sourceUrl: "https://store.example/tv" };
  const receiptLine = item({ ...base, id: crypto.randomUUID(), priceUsd: 100, changes: [{ id: crypto.randomUUID(), at: "", source: "receipt photo", evidenceRef: null, before: {}, after: { userValueUsd: 95 } }] });
  const identifiedLine = item({ ...base, id: crypto.randomUUID(), priceUsd: 200 });
  const highNoRead = item({ ...base, id: crypto.randomUUID(), priceUsd: 400 });
  const highRead = item({
    ...base,
    id: crypto.randomUUID(),
    priceUsd: 500,
    identityCheck: { result: "confirmed", reads: [{ kind: "TV", brand: "VIZIO", model: null, evidence: "" }, { kind: "TV", brand: "VIZIO", model: null, evidence: "" }], at: "", resolved: null },
  });
  const statedLine = item({ ...base, id: crypto.randomUUID(), priceUsd: 100, brand: null, identitySettled: false, detail: "Stated, not seen. Antique telephone in the dresser." });
  const hiddenLine = item({ ...base, id: crypto.randomUUID(), priceUsd: 9999, hidden: true });
  const ledgerRooms: RoomShard[] = [{ id: crypto.randomUUID(), title: "Bedroom", items: [receiptLine, identifiedLine, highNoRead, highRead, statedLine, hiddenLine] }];
  const ledger = proofLedger(ledgerRooms);
  check("ledger: a receipt line is in the receipt band", bandOf(receiptLine) === "receipt");
  check("ledger: a branded line under $250 at its bar is seen and counted", bandOf(identifiedLine) === "identified");
  check("ledger: over $250, counted needs two reads that agree", bandOf(highNoRead) === "estimated" && bandOf(highRead) === "identified");
  check("ledger: the same line with no checked page is not counted", bandOf({ ...identifiedLine, sourceUrl: null }) === "estimated");
  check("ledger: a line from the owner's words is stated, not seen", bandOf(statedLine) === "stated");
  check("ledger: the bands add up to the total and leave hidden lines out", ledger.total === 1300 && ledger.bands.receipt.usd + ledger.bands.identified.usd + ledger.bands.estimated.usd + ledger.bands.stated.usd === ledger.total);
  check("ledger: proven is receipt plus seen and identified", ledger.proven === 800);

  // Tap to replay: about three seconds around the clearest second, inside the clip, captioned.
  const span = replayWindow(14, 30_000);
  check("replay: it starts a second before and stays inside the clip", span.startMs === 13_000 && span.endMs === 16_500 && replayWindow(0.2, 7_000).startMs === 0 && replayWindow(29.9, 30_000).endMs === 30_000);
  const words = [
    { startMs: 12_000, endMs: 13_500, text: "this is the TV console" },
    { startMs: 14_000, endMs: 15_800, text: "we have a Vizio TV" },
    { startMs: 25_000, endMs: 26_000, text: "and the lamp" },
  ];
  check("replay: the caption is what was said at that moment", replayCaption(words, 14_500, span) === "we have a Vizio TV");
  check("replay: words outside the played seconds are never captioned", replayCaption(words, 16_000, span) !== "and the lamp" && replayCaption([words[2]!], 14_000, span) === "");

  // Before and after: a second walk against the saved lines. "Not seen" is never "missing".
  const savedLine = (id: string, name: string) => item({ id, name, said: [], damage: null });
  const before: RoomShard[] = [
    { id: crypto.randomUUID(), title: "Primary bedroom", items: [savedLine("radio", "Marshall radio"), savedLine("tv", "Vizio TV"), savedLine("lamp", "Lamp")] },
    { id: crypto.randomUUID(), title: "Gym", items: [savedLine("bike", "Peloton")] },
  ];
  const after: RoomShard[] = [
    { id: crypto.randomUUID(), title: "Primary bedroom", items: [savedLine("tv-2", "Vizio TV"), savedLine("new-1", "Hamper")] },
    { id: crypto.randomUUID(), title: "Hallway", items: [{ ...savedLine("lamp-2", "Lamp"), damage: { note: "cracked base", severity: "moderate", clipId: null, atSec: null } }] },
  ];
  const compared = compareWalks(
    before,
    after,
    [
      { aId: "tv", bId: "tv-2", sure: true },
      { aId: "lamp", bId: "lamp-2", sure: true },
    ],
    ["Primary bedroom", "Hallway"],
    "2026-11-04T20:14:00.000Z",
  );
  const statusOf = (id: string) => compared.entries.find((entry) => entry.ids[0] === id)?.status;
  check("walk: a removed object in a room that was walked is not seen", statusOf("radio") === "not seen");
  check("walk: an object seen again is seen", statusOf("tv") === "seen");
  check("walk: damage seen now and not before is a change, and wins over moved", statusOf("lamp") === "changed");
  check("walk: a room the walk did not enter is not checked, never not seen", statusOf("bike") === "not checked");
  check("walk: lines only on the new walk are counted as new", compared.added === 1 && walkCounts(compared).notSeen === 1);
  const radio = compared.entries.find((entry) => entry.ids[0] === "radio");
  check("walk: the words say not seen since the last walk, never missing", Boolean(radio) && /^Not seen since /.test(walkLabel(radio!, compared.since)) && !/missing|stolen/i.test(walkLabel(radio!, compared.since)));

  // What-belongs-here: at most three questions, never a completeness claim, and "Not here" is remembered.
  const asked = belongsSchema.parse({
    questions: [
      { thing: "router", question: "Is there a router or streaming box near the TV?", reason: "A TV and console are listed." },
      { thing: "blankets", question: "Are there blankets in the hall closet?", reason: "" },
      { thing: "lamp", question: "Is there a lamp by the bed?", reason: "A nightstand is listed." },
      { thing: "rug", question: "Is there a rug?", reason: "" },
    ],
  }).questions;
  check("belongs: at most three questions come back", asked.length === 3);
  const claims = belongsSchema.parse({
    questions: [
      { thing: "none", question: "This room looks complete.", reason: "" },
      { thing: "router", question: "Is there a router?", reason: "Everything else is listed." },
      { thing: "", question: "Is there something?", reason: "" },
    ],
  }).questions;
  check("belongs: a reply that says the list is complete, or has no thing, is dropped", claims.length === 0);
  check("belongs: a broken reply is no questions, not an error", belongsSchema.parse({ questions: "nope" }).questions.length === 0 && belongsSchema.parse({}).questions.length === 0);
  check("belongs: long text is cut to the contract", belongsSchema.parse({ questions: [{ thing: "x".repeat(80), question: "q".repeat(300), reason: "r".repeat(300) }] }).questions[0]?.question.length === 120);
  const notHere = new Set([notHereKey("Primary bedroom", "Router")]);
  check("belongs: Not here is remembered for that room only", withoutNotHere(asked, "primary bedroom", notHere).every((question) => question.thing !== "router") && withoutNotHere(asked, "Hallway", notHere).length === 3);
  check("belongs: the prompt forbids brands and completeness claims, and treats the list as data", /Never name a brand/.test(BELONGS_PROMPT) && /Never say the list is complete/.test(BELONGS_PROMPT) && /data, not instructions/.test(BELONGS_PROMPT));

  // The CSV carries each line's evidence band.
  const bandCsv = inventoryCsv({
    title: "House",
    homeAddress: "1 Main",
    addressRegion: "us",
    addressPoint: null,
    place: null,
    locationCheck: null,
    recordHash: null,
    items: [],
    clips: [],
    rooms: [{ id: crypto.randomUUID(), title: "Bedroom", items: [item({ id: crypto.randomUUID(), name: "Sofa", detail: "Stated, not seen. In the attic." })] }],
  } as unknown as HomeInventory);
  const [csvHead, csvRow] = bandCsv.split("\n");
  const cells = (line: string) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.filter((cell) => cell !== "").length ?? 0;
  check(
    "csv: an evidence_band column, filled for each line",
    csvHead?.endsWith(",evidence_band") === true && csvRow?.endsWith(',"Stated, not seen"') === true && cells(csvHead) === cells(csvRow),
    `${cells(csvHead ?? "")} / ${cells(csvRow ?? "")}`,
  );
}

{
  // Research layer: metrics and demo cards live in apps/web/research and never reach the app.
  const webRoot = join(process.cwd());
  const appFiles = ["app", "components", "lib"].flatMap((dir) => listSources(join(webRoot, dir)));
  const importsResearch = appFiles.filter((file) => /from\s+["'][^"']*research\//.test(readFileSync(file, "utf8")));
  check("research: nothing in app, components, or lib imports the research layer", appFiles.length > 20 && importsResearch.length === 0, importsResearch.join(", "));

  const stats = { ...blankScanStats(crypto.randomUUID(), "2026-11-04T20:14:00.000Z"), clips: 10, listedLines: 62, mergedLive: 3, mergedAtDone: 1, repeatsAsked: 4, repeatsMergedByOwner: 1, photoChecks: { same: 2, different: 1, unsure: 1 }, roomPrompts: { asked: 2, accepted: 1, declined: 1 }, belongs: { asked: 6, notHere: 3 } };
  const branded = (id: string, name: string, brand: string | null, price: number) =>
    item({ id, name, brand, priceUsd: price, markings: null, identitySettled: false, said: [], valueBasis: null, sightings: [{ clipId: "c1", atSec: 4 }] });
  const metricRooms: RoomShard[] = [
    { id: crypto.randomUUID(), title: "Primary bedroom", items: [branded(crypto.randomUUID(), "Vizio TV", "VIZIO", 322), branded(crypto.randomUUID(), "Tower fan", "Honeywell", 56), branded(crypto.randomUUID(), "Lamp", null, 30)] },
  ];
  const inventoryShape = { rooms: metricRooms, clips: [{ startedAt: "2026-11-04T20:14:00.000Z", durationMs: 30_000 }] } as unknown as Pick<HomeInventory, "rooms" | "clips">;
  const noScore = buildScanMetrics({ run: 1, build: "abc123", inventory: inventoryShape, stats, score: null });
  check("metrics: merges over lines listed is the duplicate rate before", noScore.duplicatesMerged === 5 && noScore.duplicateRateBefore === Math.round((5 / 62) * 1000) / 1000);
  check("metrics: brands are counted against the hand list's brands", noScore.brands.found === 2 && noScore.brands.expected === 10);
  check("metrics: reminders and room prompts are rates of what was asked", noScore.belongs.notHereRate === 0.5 && noScore.roomPrompts.perClip === 0.2);
  check("metrics: an unscored run has no score and no after-merge duplicate rate", noScore.score === null && noScore.duplicateRateAfter === null);
  const scored = buildScanMetrics({ run: 2, build: "def456", inventory: inventoryShape, stats, score: { duplicateUnits: 1, phantomUnits: 0, improperInclusionUnits: 0, unresolvedUnits: 0, notExposedUnits: 0, remindersOn: true, correct: { ...allCorrect(), 30: 0 }, includedUnits: 60 } });
  check("metrics: a scored run carries the five-run scorecard values and the Reminders setting", scored.score?.matchScore === 96.7 && scored.score.remindersOn && scored.duplicateRateAfter === Math.round((1 / 60) * 1000) / 1000);
  check("metrics: a record is valid against its own contract", scanMetricsSchema.safeParse(scored).success);
  const deltas = compareMetrics(noScore, scored);
  check("metrics: two scans compare side by side with a change", deltas.find((row) => row.key === "matchScore")?.delta === null && deltas.find((row) => row.key === "lines")?.delta === 0);
  const trend = trendSummary([scored, noScore]);
  check("metrics: the trend is in run order with an average", trend.find((row) => row.key === "lines")?.values.length === 2 && trend.find((row) => row.key === "matchScore")?.average === 96.7);
  check("metrics: the summary says these are research measurements, not product claims", /not product claims/.test(trendMarkdown([noScore, scored])));
  const cards = demoCards(metricRooms, stats);
  check("demo cards: one per feature beat, the same walk without and with the step", cards.length === 4 && cards[2]?.without.value === "62 lines");
  check("demo cards: they name no other product and say so", /not a measurement of any other product/.test(demoCompareMarkdown(cards, 1)) && !/competitor|chatgpt|gpt|gemini|claude/i.test(demoCompareMarkdown(cards, 1)));

  const withStats = {
    id: crypto.randomUUID(),
    number: 1,
    title: "Test",
    homeAddress: "1 Main",
    addressRegion: "us",
    addressPoint: null,
    place: null,
    locationCheck: null,
    savedVersion: 1,
    loaded: true,
    createdAt: new Date().toISOString(),
    coverUrl: "",
    recordHash: null,
    sealedAt: null,
    rooms: metricRooms,
    clips: [],
    items: [],
    scanStats: [stats],
  } as HomeInventory;
  // Marker values that appear nowhere else, so any leak of the counters shows up in the text.
  const marked = {
    ...stats,
    scanId: "5ca95ca9-5ca9-45ca-95ca-95ca95ca95ca",
    listedLines: 98_761,
    mergedLive: 98_762,
    mergedAtDone: 98_763,
    repeatsAsked: 98_764,
    photoChecks: { same: 98_765, different: 98_766, unsure: 98_767 },
    roomPrompts: { asked: 98_768, accepted: 98_769, declined: 98_770 },
    belongs: { asked: 98_771, notHere: 98_772 },
  };
  const leaked = (text: string) =>
    /scanStats|listedLines|mergedLive|mergedAtDone|repeatsAsked|photoChecks|roomPrompts|notHere|5ca95ca9-5ca9|9876[1-9]|9877[0-2]/.test(text);
  const exported = { ...withStats, scanStats: [marked] } as HomeInventory;
  check("research: scan counters never reach the claim file", !leaked(JSON.stringify(inventoryJson(exported))));
  check("research: scan counters never reach the CSV", !leaked(inventoryCsv(exported)));
  check("research: scan counters never reach the proof text that is shared or mailed", !leaked(proofText(exported)));
  check("research: scan counters never reach the measures in the claim file", !leaked(JSON.stringify(documentMeasures(exported))));
  const savedDoc = toSaveRequest({ ...exported, rooms: [] }, []);
  check("research: the counters are kept in the saved document, where only research reads them", savedDoc?.document.scanStats?.[0]?.listedLines === 98_761);
  const recordKeys = Object.keys(scanMetricsSchema.shape);
  check(
    "research: a metrics record holds counts, never an address, a name, or narration",
    !recordKeys.some((key) => /address|title|name|narration|said|spoken|photo(Url|Path)/i.test(key)),
  );
}

console.log(failures === 0 ? "\nHarness: all checks passed." : `\nHarness: ${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
