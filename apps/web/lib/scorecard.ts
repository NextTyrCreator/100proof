/**
 * The walkthrough scorecard. One small space, inventoried by hand on 2026-11-03, is the reference list.
 * A scan is scored against it unit by unit, before any manual edit. The rules are the ones in
 * `docs/SCORECARD.md` and the workbook it came from: one credited match per expected unit, every extra
 * included unit is an error, and a correct exclusion is disclosed but neither rewarded nor penalized.
 *
 * Nothing here is a public accuracy claim. The match score is a benchmark against this one list.
 */

type CountAs = "item" | "items" | "arrangement" | "pair" | "set" | "dumbbells" | "lot";

type ExpectedEntry = {
  /** The handwritten source number, 1 to 40. Stable across baseline versions. */
  id: number;
  room: "Front entrance" | "Bedroom 1" | "Hallway" | "Gym";
  name: string;
  /** Normalized test units for this entry. Two dumbbells are two units; one pair of shoes is one. */
  units: number;
  countAs: CountAs;
  /** The owner's handwritten amount for the whole row, in USD. Provisional. Not a replacement price. */
  ownerLowUsd: number;
  ownerHighUsd: number;
  /** A brand that was written on the hand list. Scored separately from identity; it does not change the unit match. */
  brand: string | null;
  note: string | null;
};

export const SCORECARD_BASELINE = {
  version: "0.1",
  /** When the space was walked by hand. The transcription to the workbook finished the next morning. */
  walkedOn: "2026-11-03",
  preparedOn: "2026-11-04",
  status: "provisional" as const,
  entries: 40,
  units: 60,
  ownerTotalLowUsd: 4895,
  ownerTotalHighUsd: 4915,
};

/** Counting rules the baseline uses. The scan is normalized the same way before it is matched. */
export const COUNTING_RULES = [
  "A plant with its vase is one arrangement.",
  "A pair of shoes is one pair.",
  "A bedding set with its sheets is one set.",
  "Two dumbbells are two units.",
  "A collection of weight plates is one lot until its plate count is known.",
  "Generic decor, frames, books, and blankets are counted as the distinct pieces the hand list names.",
  "The amounts are the owner's provisional estimates for each row, not verified replacement prices.",
] as const;

export const EXPECTED: ExpectedEntry[] = [
  { id: 1, room: "Front entrance", name: "Plant with vase", units: 1, countAs: "arrangement", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: "Plant and vase count together." },
  { id: 2, room: "Front entrance", name: "Stand", units: 1, countAs: "item", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: "Stand type not specified." },
  { id: 3, room: "Front entrance", name: "Plant with vase", units: 1, countAs: "arrangement", ownerLowUsd: 20, ownerHighUsd: 40, brand: null, note: "A \"2\" was noted. Provisional: one arrangement until confirmed." },
  { id: 4, room: "Front entrance", name: "OOFOS sandals", units: 1, countAs: "pair", ownerLowUsd: 20, ownerHighUsd: 20, brand: "OOFOS", note: null },
  { id: 5, room: "Front entrance", name: "Crocs, camouflage", units: 1, countAs: "pair", ownerLowUsd: 20, ownerHighUsd: 20, brand: "Crocs", note: null },
  { id: 6, room: "Front entrance", name: "Decor items", units: 5, countAs: "items", ownerLowUsd: 50, ownerHighUsd: 50, brand: null, note: "Five distinct pieces, 06-A to 06-E." },
  { id: 7, room: "Front entrance", name: "Small plant with vase", units: 1, countAs: "arrangement", ownerLowUsd: 10, ownerHighUsd: 10, brand: null, note: null },
  { id: 8, room: "Front entrance", name: "Plant with vase", units: 1, countAs: "arrangement", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: "Identify separately from the other arrangements." },
  { id: 9, room: "Front entrance", name: "Small plant with vase", units: 1, countAs: "arrangement", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: null },
  { id: 10, room: "Front entrance", name: "Incense holder", units: 1, countAs: "item", ownerLowUsd: 5, ownerHighUsd: 5, brand: null, note: "Written as decor item / incense holder." },
  { id: 11, room: "Front entrance", name: "Small leaf bowl for candy", units: 1, countAs: "item", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: "Amount read as $20." },
  { id: 12, room: "Front entrance", name: "Candle decor", units: 1, countAs: "item", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: null },
  { id: 13, room: "Front entrance", name: "Entry table", units: 1, countAs: "item", ownerLowUsd: 80, ownerHighUsd: 80, brand: null, note: null },
  { id: 14, room: "Bedroom 1", name: "Vizio TV", units: 1, countAs: "item", ownerLowUsd: 400, ownerHighUsd: 400, brand: "Vizio", note: "Model and serial not on the hand list." },
  { id: 15, room: "Bedroom 1", name: "Honeywell fan", units: 1, countAs: "item", ownerLowUsd: 60, ownerHighUsd: 60, brand: "Honeywell", note: null },
  { id: 16, room: "Bedroom 1", name: "Trash can", units: 1, countAs: "item", ownerLowUsd: 10, ownerHighUsd: 10, brand: null, note: "On the hand list. The scan's not-property rule drops trash, not the can." },
  { id: 17, room: "Bedroom 1", name: "Marshall radio", units: 1, countAs: "item", ownerLowUsd: 200, ownerHighUsd: 200, brand: "Marshall", note: null },
  { id: 18, room: "Bedroom 1", name: "Hamper", units: 1, countAs: "item", ownerLowUsd: 10, ownerHighUsd: 10, brand: null, note: null },
  { id: 19, room: "Bedroom 1", name: "Queen mattress", units: 1, countAs: "item", ownerLowUsd: 300, ownerHighUsd: 300, brand: null, note: null },
  { id: 20, room: "Bedroom 1", name: "Queen bed frame", units: 1, countAs: "item", ownerLowUsd: 50, ownerHighUsd: 50, brand: null, note: "Separate from the mattress." },
  { id: 21, room: "Bedroom 1", name: "Queen bedding set and sheets", units: 1, countAs: "set", ownerLowUsd: 40, ownerHighUsd: 40, brand: null, note: null },
  { id: 22, room: "Bedroom 1", name: "eero router", units: 1, countAs: "item", ownerLowUsd: 100, ownerHighUsd: 100, brand: "eero", note: null },
  { id: 23, room: "Bedroom 1", name: "Surge protector", units: 1, countAs: "item", ownerLowUsd: 5, ownerHighUsd: 5, brand: null, note: null },
  { id: 24, room: "Bedroom 1", name: "Lamp", units: 1, countAs: "item", ownerLowUsd: 5, ownerHighUsd: 5, brand: null, note: "Separate from lamp 25." },
  { id: 25, room: "Bedroom 1", name: "Lamp", units: 1, countAs: "item", ownerLowUsd: 5, ownerHighUsd: 5, brand: null, note: "Descriptor unclear on the hand list." },
  { id: 26, room: "Bedroom 1", name: "Nightstand", units: 1, countAs: "item", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: null },
  { id: 27, room: "Bedroom 1", name: "Dresser", units: 1, countAs: "item", ownerLowUsd: 80, ownerHighUsd: 80, brand: null, note: null },
  { id: 28, room: "Bedroom 1", name: "Picture frames", units: 3, countAs: "items", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: "Three frames, sizes unknown. $20 is the row total." },
  { id: 29, room: "Bedroom 1", name: "Small basket", units: 1, countAs: "item", ownerLowUsd: 5, ownerHighUsd: 5, brand: null, note: null },
  { id: 30, room: "Bedroom 1", name: "Antique telephone", units: 1, countAs: "item", ownerLowUsd: 100, ownerHighUsd: 100, brand: null, note: "Inside the dresser. Expose it on camera for a visual test." },
  { id: 31, room: "Hallway", name: "Decor items", units: 8, countAs: "items", ownerLowUsd: 80, ownerHighUsd: 80, brand: null, note: "Eight distinct pieces, 31-A to 31-H." },
  { id: 32, room: "Hallway", name: "Books", units: 2, countAs: "items", ownerLowUsd: 20, ownerHighUsd: 20, brand: null, note: null },
  { id: 33, room: "Hallway", name: "Blankets", units: 6, countAs: "items", ownerLowUsd: 60, ownerHighUsd: 60, brand: null, note: "Hallway location assumed." },
  { id: 34, room: "Gym", name: "Bowflex dumbbells", units: 2, countAs: "dumbbells", ownerLowUsd: 200, ownerHighUsd: 200, brand: "Bowflex", note: "$200 for the pair." },
  { id: 35, room: "Gym", name: "Steel barbell", units: 1, countAs: "item", ownerLowUsd: 200, ownerHighUsd: 200, brand: null, note: null },
  { id: 36, room: "Gym", name: "Fitness Gear weights, 185 lb", units: 1, countAs: "lot", ownerLowUsd: 200, ownerHighUsd: 200, brand: "Fitness Gear", note: "One lot until the plate count is known." },
  { id: 37, room: "Gym", name: "Bowflex bench", units: 1, countAs: "item", ownerLowUsd: 100, ownerHighUsd: 100, brand: "Bowflex", note: null },
  { id: 38, room: "Gym", name: "Fitness Gear Olympic rack", units: 1, countAs: "item", ownerLowUsd: 100, ownerHighUsd: 100, brand: "Fitness Gear", note: null },
  { id: 39, room: "Gym", name: "Peloton", units: 1, countAs: "item", ownerLowUsd: 2000, ownerHighUsd: 2000, brand: "Peloton", note: "Equipment type, model, and serial not on the hand list." },
  { id: 40, room: "Gym", name: "TISSCARE foot massager", units: 1, countAs: "item", ownerLowUsd: 200, ownerHighUsd: 200, brand: "TISSCARE", note: null },
];

/** Per-run inputs, scored on the original automatic output before any manual correction. */
type RunInput = {
  /** Correctly captured units per expected entry id. At most that entry's units. Missing ids are misses. */
  correct: Record<number, number>;
  /** Extra included units, one primary category each. */
  duplicateUnits: number;
  phantomUnits: number;
  improperInclusionUnits: number;
  /** Units whose inclusion is still undecided. Any of these withholds the final score. */
  unresolvedUnits: number;
  /** Every unit in the evaluated included output after normalization. Must equal correct + extra. */
  includedUnits: number;
  /** Expected units the walk never put on camera. A subset of the misses; a filming issue, still a miss. */
  notExposedUnits: number;
};

type RunScore =
  | { status: "invalid"; reason: string }
  | { status: "pending"; reason: string; truePositives: number; falseNegatives: number; falsePositives: number }
  | {
      status: "scored";
      truePositives: number;
      falseNegatives: number;
      falsePositives: number;
      /** TP / (TP + FN + FP). The combined benchmark score. */
      matchScore: number;
      /** TP / expected. Completeness only. */
      captureRate: number;
      /** TP / included. Null when nothing was included. */
      precision: number | null;
      result: "PASS" | "Needs work";
      missedIds: number[];
    };

function round1(value: number) {
  return Math.round(value * 1000) / 10;
}

/**
 * Score one run. The expected list is the frozen baseline. The arithmetic follows the workbook:
 * TP + FN must equal the expected units, TP + FP must equal the included units, and an unresolved
 * decision keeps the final score unavailable.
 */
export function scoreRun(input: RunInput, expected: ExpectedEntry[] = EXPECTED): RunScore {
  const expectedUnits = expected.reduce((sum, entry) => sum + entry.units, 0);
  if (expectedUnits === 0 && input.includedUnits === 0) return { status: "invalid", reason: "Nothing expected and nothing included. Not applicable." };

  const counts = [input.duplicateUnits, input.phantomUnits, input.improperInclusionUnits, input.unresolvedUnits, input.includedUnits, input.notExposedUnits];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) return { status: "invalid", reason: "Counts must be whole numbers, zero or more." };

  let truePositives = 0;
  const missedIds: number[] = [];
  for (const entry of expected) {
    const credited = input.correct[entry.id] ?? 0;
    if (!Number.isInteger(credited) || credited < 0) return { status: "invalid", reason: `Entry ${entry.id} has an invalid count.` };
    if (credited > entry.units) return { status: "invalid", reason: `Entry ${entry.id} is credited above its ${entry.units} unit(s).` };
    truePositives += credited;
    if (credited < entry.units) missedIds.push(entry.id);
  }
  for (const key of Object.keys(input.correct)) {
    if (!expected.some((entry) => entry.id === Number(key))) return { status: "invalid", reason: `Entry ${key} is not on the baseline.` };
  }

  const falseNegatives = expectedUnits - truePositives;
  if (input.notExposedUnits > falseNegatives) return { status: "invalid", reason: "Unexposed units cannot exceed the misses." };
  const falsePositives = input.duplicateUnits + input.phantomUnits + input.improperInclusionUnits;
  if (truePositives + falsePositives !== input.includedUnits) {
    return { status: "invalid", reason: `Included units (${input.includedUnits}) do not reconcile to correct (${truePositives}) plus extra (${falsePositives}).` };
  }
  if (input.unresolvedUnits > 0) {
    return { status: "pending", reason: `${input.unresolvedUnits} inclusion decision(s) unresolved. Final score withheld.`, truePositives, falseNegatives, falsePositives };
  }

  const denominator = truePositives + falseNegatives + falsePositives;
  const matchScore = denominator === 0 ? 0 : round1(truePositives / denominator);
  const captureRate = expectedUnits === 0 ? 0 : round1(truePositives / expectedUnits);
  const precision = input.includedUnits === 0 ? null : round1(truePositives / input.includedUnits);
  const exact = truePositives === expectedUnits && falsePositives === 0;
  return {
    status: "scored",
    truePositives,
    falseNegatives,
    falsePositives,
    matchScore,
    captureRate,
    precision,
    result: exact ? "PASS" : "Needs work",
    missedIds,
  };
}

/**
 * The research series. One walk is a measurement. The accuracy rate is the average match score of
 * five scored walks of this same space, and it is not stated before those five exist.
 *
 * The target is 95 on every run and on the average. That target is a bar for this research. It is
 * not a result, and nothing here claims a scan has reached it.
 *
 * Consistency is the sample variance of the five match scores. Variance above 4 (a sample standard
 * deviation of 2 percentage points) means the walks do not agree closely enough to treat the average
 * as stable. The average is still recorded. A pending or rejected run withholds the series; it is
 * not dropped to improve the average. A sixth run is a new series.
 */
export const RESEARCH_SERIES = {
  runs: 5,
  target: 95,
  maxVariance: 4,
} as const;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** One decimal on a number that is already a percent. `round1` is for a 0..1 ratio. */
function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

/** Average, variance, and agreement for a series of scored runs. No rate before five scored runs. */
export function scoreSeries(runs: RunScore[]) {
  const blocked = runs.find((run) => run.status !== "scored");
  if (blocked?.status === "invalid") return { status: "withheld" as const, reason: "A run was rejected. The series has no rate." };
  if (blocked?.status === "pending") return { status: "withheld" as const, reason: "A run still has an unresolved decision. The series has no rate." };
  if (runs.length < RESEARCH_SERIES.runs) {
    return {
      status: "incomplete" as const,
      reason: `The rate is stated after ${RESEARCH_SERIES.runs} scored runs. ${runs.length} so far.`,
      recorded: runs.length,
    };
  }
  if (runs.length > RESEARCH_SERIES.runs) {
    return { status: "invalid" as const, reason: `A series is ${RESEARCH_SERIES.runs} scored runs. This has ${runs.length}. Start a new series.` };
  }

  const scores = runs.map((run) => (run.status === "scored" ? run.matchScore : 0));
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const average = roundPercent(mean);
  const variance = round2(scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / (scores.length - 1));
  const spread = roundPercent(Math.max(...scores) - Math.min(...scores));
  const atTarget = scores.every((score) => score >= RESEARCH_SERIES.target) && average >= RESEARCH_SERIES.target;
  const consistent = variance <= RESEARCH_SERIES.maxVariance;
  const result =
    atTarget && consistent ? "meets target" : atTarget ? "inconsistent" : consistent ? "below target" : "below target and inconsistent";
  return { status: "recorded" as const, scores, average, variance, spread, atTarget, consistent, result };
}

/** A run input where every expected unit is credited. The starting point for scoring a walk by hand. */
export function allCorrect(expected: ExpectedEntry[] = EXPECTED): Record<number, number> {
  return Object.fromEntries(expected.map((entry) => [entry.id, entry.units]));
}

export function expectedUnits(expected: ExpectedEntry[] = EXPECTED) {
  return expected.reduce((sum, entry) => sum + entry.units, 0);
}

export function roomTotals(expected: ExpectedEntry[] = EXPECTED) {
  const rooms = new Map<string, { entries: number; units: number; lowUsd: number; highUsd: number }>();
  for (const entry of expected) {
    const row = rooms.get(entry.room) ?? { entries: 0, units: 0, lowUsd: 0, highUsd: 0 };
    row.entries += 1;
    row.units += entry.units;
    row.lowUsd += entry.ownerLowUsd;
    row.highUsd += entry.ownerHighUsd;
    rooms.set(entry.room, row);
  }
  return rooms;
}
