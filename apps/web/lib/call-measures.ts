import { z } from "zod";
import type { ModelCall } from "./review-scan";

/** Muse Voice Transcribe 1.0 list price. The text model's cost is not in its response, so calls and latency are counted instead. */
const TRANSCRIBE_USD_PER_MINUTE = 3 / 1000;

type CallKind = ModelCall["call"];

type CallSummary = {
  call: CallKind;
  calls: number;
  failed: number;
  medianLatencyMs: number;
  totalLatencyMs: number;
  bytesIn: number;
  audioMs: number;
};

export type CallMeasures = {
  byCall: CallSummary[];
  calls: number;
  failed: number;
  firstCallAt: string | null;
  lastCallAt: string | null;
  transcriptionUsd: number;
};

export const callMeasuresSchema = z.object({
  byCall: z.array(
    z.object({
      call: z.enum(["list", "price", "photo", "narration"]),
      calls: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      medianLatencyMs: z.number().nonnegative(),
      totalLatencyMs: z.number().nonnegative(),
      bytesIn: z.number().nonnegative(),
      audioMs: z.number().nonnegative(),
    }),
  ),
  calls: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  firstCallAt: z.string().nullable(),
  lastCallAt: z.string().nullable(),
  transcriptionUsd: z.number().nonnegative(),
});

const ORDER: CallKind[] = ["list", "narration", "price", "photo"];

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function summarizeCalls(calls: (Pick<ModelCall, "call" | "ok" | "latencyMs" | "bytesIn" | "audioMs"> & { at?: string })[]): CallMeasures {
  const by = new Map<CallKind, { failed: number; latencies: number[]; bytesIn: number; audioMs: number }>();
  let first: string | null = null;
  let last: string | null = null;
  for (const call of calls) {
    const entry = by.get(call.call) ?? { failed: 0, latencies: [], bytesIn: 0, audioMs: 0 };
    entry.failed += call.ok ? 0 : 1;
    entry.latencies.push(call.latencyMs);
    entry.bytesIn += call.bytesIn;
    entry.audioMs += call.audioMs ?? 0;
    by.set(call.call, entry);
    if (call.at) {
      if (!first || call.at < first) first = call.at;
      if (!last || call.at > last) last = call.at;
    }
  }
  const byCall = ORDER.flatMap((kind) => {
    const entry = by.get(kind);
    if (!entry) return [];
    return [
      {
        call: kind,
        calls: entry.latencies.length,
        failed: entry.failed,
        medianLatencyMs: median(entry.latencies),
        totalLatencyMs: entry.latencies.reduce((sum, value) => sum + value, 0),
        bytesIn: entry.bytesIn,
        audioMs: entry.audioMs,
      },
    ];
  });
  const audioMinutes = (by.get("narration")?.audioMs ?? 0) / 60_000;
  return {
    byCall,
    calls: calls.length,
    failed: byCall.reduce((sum, entry) => sum + entry.failed, 0),
    firstCallAt: first,
    lastCallAt: last,
    transcriptionUsd: Math.round(audioMinutes * TRANSCRIBE_USD_PER_MINUTE * 10_000) / 10_000,
  };
}
