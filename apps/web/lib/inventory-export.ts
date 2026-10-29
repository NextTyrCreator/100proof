import { addressRegionLabel } from "./address-search";
import { openRequests } from "./evidence-requests";
import {
  cashValueTotal,
  inventoryLabel,
  locationCheckedAt,
  locationCheckLabel,
  replacementTotal,
  type HomeInventory,
} from "./inventory";
import { accuracyMark } from "./accuracy-mark";
import { documentMeasures } from "./inventory-measures";
import { STANDARD } from "./standard";

/**
 * The file a claims professional can import. Each line keeps what the camera showed, what the person said,
 * what a receipt shows, what a comparable supports, and what changed, apart from one another.
 */
function inventoryJson(inventory: HomeInventory) {
  const clipNumber = new Map(inventory.clips.map((clip, index) => [clip.id, index + 1]));
  const open = openRequests(inventory.rooms);
  const measures = documentMeasures(inventory);

  return {
    format: "100proof.inventory",
    schemaVersion: STANDARD.schemaVersion,
    exportedAt: new Date().toISOString(),
    savedVersion: Math.max(0, inventory.savedVersion),
    inventory: {
      title: inventoryLabel(inventory),
      country: addressRegionLabel(inventory.addressRegion),
      address: inventory.homeAddress.trim(),
      locationCheck: { result: locationCheckLabel(inventory) || "not compared", at: locationCheckedAt(inventory) },
      recordHash: inventory.recordHash,
      sealedAt: inventory.sealedAt,
    },
    notice:
      "100proof prepares this record. It does not decide coverage, it is not a sworn proof of loss, and the carrier decides what a policy pays.",
    clips: inventory.clips.map((clip, index) => ({
      number: index + 1,
      startedAt: clip.startedAt,
      durationSeconds: Math.round(clip.durationMs / 1000),
      sha256: clip.contentHash,
      keptOnAccount: Boolean(clip.storagePath),
      spoken: clip.spoken.map((line) => ({ fromSeconds: Math.round(line.startMs / 100) / 10, toSeconds: Math.round(line.endMs / 100) / 10, text: line.text })),
    })),
    rooms: inventory.rooms.map((room) => ({
      title: room.title,
      lines: room.items.map((item) => ({
        id: item.id,
        name: item.name,
        count: item.count,
        countSettled: item.countSettled,
        identitySettled: item.identitySettled,
        grouped: item.grouped,
        enteredBy: item.enteredBy,
        category: item.category,
        brand: item.brand,
        likelyBrand: item.likelyBrand ? { name: item.likelyBrand.name, clues: item.likelyBrand.clues, confirmed: false } : null,
        markings: item.markings,
        serial: item.serial,
        condition: item.condition,
        damage: item.damage
          ? {
              note: item.damage.note,
              severity: item.damage.severity,
              clip: item.damage.clipId ? (clipNumber.get(item.damage.clipId) ?? null) : null,
              atSeconds: item.damage.atSec,
            }
          : null,
        replacementUsdEach: item.priceUsd,
        cashValueUsdEach: item.cashValueUsd,
        depreciationNote: item.depreciationNote,
        evidence: {
          camera: item.sightings.map((sighting) => ({
            clip: sighting.clipId ? (clipNumber.get(sighting.clipId) ?? null) : null,
            atSeconds: sighting.atSec,
          })),
          said: item.said.map((fact) => ({ text: fact.text, how: fact.heard, clip: fact.clipId ? (clipNumber.get(fact.clipId) ?? null) : null, atSeconds: fact.atSec })),
          receipt: item.userValueUsd == null ? null : { pricePaidUsdEach: item.userValueUsd },
          valuation: item.valueBasis ? { basis: item.valueBasis, source: item.sourceUrl, pricedAt: item.pricedAt } : null,
          possibleModels: item.options,
          photo: Boolean(item.photoPath),
        },
        accuracy: (() => {
          const mark = accuracyMark(item);
          return {
            tier: mark.tier,
            label: mark.label,
            signalsMet: mark.met,
            signalsTotal: mark.total,
            present: mark.signals.filter((signal) => signal.met).map((signal) => signal.key),
            missing: mark.signals.filter((signal) => !signal.met).map((signal) => signal.key),
            receiptConfirmed: mark.receiptConfirmed,
            next: mark.next,
          };
        })(),
        changes: item.changes.map((entry) => ({ at: entry.at, by: entry.source, before: entry.before, after: entry.after })),
        note: item.userNote,
      })),
    })),
    exceptions: open.map((request) => ({
      line: request.itemId,
      room: request.roomTitle,
      item: request.itemName,
      needs: request.kind,
      why: request.why,
      dollarsInDoubt: request.inDoubtUsd,
    })),
    totals: {
      replacementUsd: replacementTotal(inventory),
      cashValueUsd: cashValueTotal(inventory),
    },
    measures,
    audit: {
      standard: STANDARD,
      generatedAt: new Date().toISOString(),
      recordHash: inventory.recordHash,
      provenance:
        "Every line keeps camera sightings, owner statements, receipt values, valuation basis, and changes with their sources, kept apart. Open items are listed as exceptions, not hidden.",
      reliance:
        "Prepared for review. 100proof does not decide coverage or payment; the carrier does. Prices are estimates at the priced date.",
    },
    workStatement: {
      status: "Hypothetical. Payments are off. This is not an invoice.",
      lines: measures.lines,
      linesChangedByEvidence: measures.linesChangedByEvidence,
      linesStillOpen: measures.linesStillOpen,
      clipsReviewed: measures.clips,
    },
  };
}

export function downloadJson(inventory: HomeInventory) {
  const blob = new Blob([JSON.stringify(inventoryJson(inventory), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "100proof-inventory.json";
  link.click();
  URL.revokeObjectURL(url);
}
