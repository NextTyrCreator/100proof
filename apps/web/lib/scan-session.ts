/** One walkthrough session: 30-second clips, five minutes of recording, pause to continue. */

export const CLIP_MS = 30_000;
export const SCAN_LIMIT_MS = 5 * 60 * 1000;
const PAUSE_LIMIT_MS = 15 * 60 * 1000;
const MAX_CLIPS = 20;

export type CloseReason = "next" | "pause" | "finish";

export type SessionClock = {
  recordedMs: number;
  clipMs: number;
  clips: number;
};

export function blankClock(): SessionClock {
  return { recordedMs: 0, clipMs: 0, clips: 0 };
}

/** Move the clock forward by time the recorder was actually running. */
export function advanceClock(clock: SessionClock, deltaMs: number): { clock: SessionClock; close: CloseReason | null } {
  const delta = Math.max(0, deltaMs);
  const recordedMs = Math.min(SCAN_LIMIT_MS, clock.recordedMs + delta);
  const gained = recordedMs - clock.recordedMs;
  const clipMs = clock.clipMs + gained;
  const next: SessionClock = { recordedMs, clipMs, clips: clock.clips };
  if (recordedMs >= SCAN_LIMIT_MS) return { clock: next, close: "finish" };
  if (clipMs >= CLIP_MS) {
    return { clock: { ...next, clipMs: CLIP_MS }, close: clock.clips + 1 >= MAX_CLIPS ? "finish" : "next" };
  }
  return { clock: next, close: null };
}

export function afterClip(clock: SessionClock): SessionClock {
  return { recordedMs: clock.recordedMs, clipMs: 0, clips: clock.clips + 1 };
}

export function pauseExpired(pausedAt: number, now: number) {
  return now - pausedAt >= PAUSE_LIMIT_MS;
}
