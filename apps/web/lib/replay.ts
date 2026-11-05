import type { SpokenLine } from "./inventory";

/** The seconds to play for a line: one before its clearest second, about three in all, inside the clip. */
export function replayWindow(atSec: number, durationMs: number) {
  const length = Math.max(1000, durationMs);
  const startMs = Math.max(0, Math.min(length - 1000, Math.round(atSec * 1000) - 1000));
  const endMs = Math.min(length, startMs + 3500);
  return { startMs, endMs };
}

/** What was being said at this moment, or the line said nearest inside the played seconds. */
export function replayCaption(spoken: SpokenLine[], nowMs: number, window: { startMs: number; endMs: number }) {
  const inside = spoken.filter((line) => line.endMs >= window.startMs && line.startMs <= window.endMs);
  const current = inside.find((line) => line.startMs <= nowMs && line.endMs >= nowMs);
  return (current ?? inside[0])?.text.slice(0, 200) ?? "";
}
