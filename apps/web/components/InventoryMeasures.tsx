"use client";

import { useEffect, useMemo, useState } from "react";
import { callMeasuresSchema, type CallMeasures } from "../lib/call-measures";
import { formatClock, formatMoney, type HomeInventory } from "../lib/inventory";
import { documentMeasures } from "../lib/inventory-measures";

const CALL_LABELS: Record<CallMeasures["byCall"][number]["call"], string> = {
  list: "Clip reviews",
  narration: "Narration transcripts",
  price: "Pricing",
  reconcile: "Repeat check",
  glance: "Live scanner",
  photo: "Evidence checks",
  voice: "Voice notes",
  receipt: "Connected receipts",
};

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** The numbers a test run is judged on. Model calls come from the account's usage record once the inventory is saved. */
export function InventoryMeasures({ inventory }: { inventory: HomeInventory }) {
  const measures = useMemo(() => documentMeasures(inventory), [inventory]);
  const saved = inventory.savedVersion > 0;
  const [calls, setCalls] = useState<CallMeasures | null>(null);
  const [callsState, setCallsState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    if (!saved) return;
    const controller = new AbortController();
    setCallsState("loading");
    fetch(`/api/inventories/${inventory.id}/measures`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        const parsed = callMeasuresSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("failed");
        setCalls(parsed.data);
        setCallsState("idle");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCallsState("failed");
      });
    return () => controller.abort();
  }, [inventory.id, saved, inventory.savedVersion]);

  const fromEvidence = measures.changesBy;
  const rows: [string, string][] = [
    ["Filmed", `${formatClock(measures.filmedSeconds * 1000)} in ${measures.clips} ${measures.clips === 1 ? "clip" : "clips"}`],
    ["Lines", `${measures.lines} in ${measures.rooms} ${measures.rooms === 1 ? "room" : "rooms"}`],
    [
      "Settled",
      measures.settledShare == null ? "—" : `${measures.linesSettled} of ${measures.lines} (${Math.round(measures.settledShare * 100)}%)`,
    ],
    [
      "Still open",
      measures.requestsStillOpen === 0
        ? "Nothing"
        : `${measures.linesStillOpen} ${measures.linesStillOpen === 1 ? "line" : "lines"}, ${formatMoney(measures.dollarsInDoubt)} in doubt`,
    ],
    ["Left for the reviewer", String(measures.requestsLeftForReviewer)],
    [
      "Accuracy marks",
      `Receipt verified ${measures.accuracy.receipt} · Strong, no receipt ${measures.accuracy.strong} · Settled or estimated from video ${measures.accuracy.settled} · Needs evidence ${measures.accuracy.open}${measures.accuracy.entered ? ` · Entered by you ${measures.accuracy.entered}` : ""}`,
    ],
    [
      "Strong without a receipt",
      measures.accuracy.strongWithoutReceiptShare == null
        ? "—"
        : `${Math.round(measures.accuracy.strongWithoutReceiptShare * 100)}% of lines without a receipt`,
    ],
    ["Evidence signals per line", measures.accuracy.averageSignals == null ? "—" : `${measures.accuracy.averageSignals} of 9 on average`],
    [
      "File checks",
      measures.checks.blockers + measures.checks.review + measures.checks.notes === 0
        ? "No contradictions or outliers"
        : `${measures.checks.blockers} to fix, ${measures.checks.review} to review, ${measures.checks.notes} notes`,
    ],
    [
      "Changed by evidence",
      `${measures.linesChangedByEvidence} ${measures.linesChangedByEvidence === 1 ? "line" : "lines"} · label ${fromEvidence["label photo"]}, receipt ${fromEvidence["receipt photo"]}, photo ${fromEvidence.photo}, clip ${fromEvidence.clip}, answer ${fromEvidence["your answer"]}`,
    ],
    ["Your edits", `${fromEvidence["your edit"]} by you · ${fromEvidence.check} by the end-of-scan check`],
    ["First clip to last change", measures.minutesToFile == null ? "—" : `${measures.minutesToFile} min`],
  ];

  return (
    <details className="measures">
      <summary>Measures</summary>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {measures.checks.issues.length > 0 ? (
        <>
          <p className="measures-head">What to look at</p>
          <ul className="measures-issues">
            {measures.checks.issues.slice(0, 5).map((issue) => (
              <li key={`${issue.code}-${issue.itemId ?? "file"}`}>{issue.message}</li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="measures-head">Model calls</p>
      {!saved ? (
        <p className="hint">Shown once this inventory is saved to your account.</p>
      ) : callsState === "loading" && !calls ? (
        <p className="hint">Loading.</p>
      ) : callsState === "failed" ? (
        <p className="hint">The model calls did not load.</p>
      ) : calls && calls.calls > 0 ? (
        <dl>
          {calls.byCall.map((entry) => (
            <div key={entry.call}>
              <dt>{CALL_LABELS[entry.call]}</dt>
              <dd>
                {entry.calls} {entry.calls === 1 ? "call" : "calls"}
                {entry.failed > 0 ? `, ${entry.failed} failed` : ""} · median {seconds(entry.medianLatencyMs)}
                {entry.call === "narration" ? ` · ${formatClock(entry.audioMs)} of audio` : ""}
              </dd>
            </div>
          ))}
          <div>
            <dt>Transcription cost</dt>
            <dd>${calls.transcriptionUsd.toFixed(4)}</dd>
          </div>
        </dl>
      ) : (
        <p className="hint">No model calls recorded for this inventory yet.</p>
      )}
    </details>
  );
}
