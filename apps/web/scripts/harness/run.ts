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
import type { ItemChange, RoomItem, RoomShard } from "../../lib/inventory";
import { checkLines } from "../../lib/invariants";
import { applyPatch, mergeRooms } from "../../lib/inventory-merge";
import { applyPrices, applyReconcile } from "../../lib/scan-pipeline";
import { ageFromSpeech, asCondition, depreciate, salvageRoomsJson, shapeWalkthrough } from "../../lib/review-shape";
import { ADD_LIMIT_MS, advanceClock, blankClock, clipsToSend, readyInOrder, SCAN_LIMIT_MS } from "../../lib/scan-session";

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
  const strong = accuracyMark(item({}));
  check("mark: corroborated line is Strong without a receipt", strong.tier === "strong" && strong.met >= 5, `${strong.met}/${strong.total}`);
  const receipt = accuracyMark(item({ userValueUsd: 950, changes: [receiptChange(950)] }));
  check("mark: receipt confirms individuality", receipt.tier === "receipt" && receipt.receiptConfirmed);
  const typed = accuracyMark(item({ userValueUsd: 950 }));
  check("mark: a typed price paid is not a receipt", typed.tier !== "receipt" && !typed.receiptConfirmed);
  const missed = accuracyMark(item({ changes: [{ ...receiptChange(950), after: {} }] }));
  check("mark: a receipt that did not list the item verifies nothing", missed.tier !== "receipt");
  const estimate = accuracyMark(item({ identitySettled: false, markings: null, valueBasis: "Comparable: hot tub" }));
  check("mark: a priced, counted line with an open model reads as estimated", estimate.tier !== "open", estimate.label);
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

// Session: ten minutes for a scan, five more to add, two clips in flight, results in order.
{
  const full = advanceClock(blankClock(), SCAN_LIMIT_MS + 5000);
  check("session: a scan stops at ten minutes", full.clock.recordedMs === 10 * 60 * 1000 && full.close === "finish");
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
  check("damage: with no age, only the damage is deducted", noAge.cash === 400, `${noAge.cash}`);
  check("damage: no damage and no age leaves cash at replacement", depreciate(1000, null, 10, "good").cash === 1000);

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

  const chipped = shapeWalkthrough(
    { rooms: [{ title: "Kitchen", items: [{ name: "Mug", category: "dishes", condition: "damaged", damage: "chip on the rim", damageSeverity: "minor", seenReplacementUsd: 12 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  check(
    "damage: a grouped line keeps the price and does not invent one damage note",
    chipped?.grouped === true && chipped.damage == null && chipped.condition === "worn" && chipped.cashValueUsd === 12,
    `${chipped?.condition} ${chipped?.cashValueUsd}`,
  );

  const guessed = shapeWalkthrough(
    { rooms: [{ title: "Bedroom", items: [{ name: "Sneakers", category: "shoes", likelyBrand: "Nike", brandClues: "swoosh", identitySettled: true, seenReplacementUsd: 120 }] }] },
    [],
    [],
  ).rooms.flatMap((entry) => entry.items)[0];
  check("brand: a likely brand does not settle the model", guessed?.identitySettled === false && guessed?.likelyBrand?.name === "Nike");

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

console.log(failures === 0 ? "\nHarness: all checks passed." : `\nHarness: ${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
