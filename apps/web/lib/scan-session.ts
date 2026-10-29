/** One walkthrough session: 30-second clips, up to ten minutes of recording, pause to continue. */

export const CLIP_MS = 30_000;
export const SCAN_LIMIT_MS = 10 * 60 * 1000;
/** Scan more on an inventory that already has clips. */
export const ADD_LIMIT_MS = 5 * 60 * 1000;
const PAUSE_LIMIT_MS = 15 * 60 * 1000;
const MAX_CLIPS = SCAN_LIMIT_MS / CLIP_MS;

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
export function advanceClock(
  clock: SessionClock,
  deltaMs: number,
  limitMs = SCAN_LIMIT_MS,
): { clock: SessionClock; close: CloseReason | null } {
  const limit = Math.min(SCAN_LIMIT_MS, Math.max(CLIP_MS, limitMs));
  const delta = Math.max(0, deltaMs);
  const recordedMs = Math.min(limit, clock.recordedMs + delta);
  const gained = recordedMs - clock.recordedMs;
  const clipMs = clock.clipMs + gained;
  const next: SessionClock = { recordedMs, clipMs, clips: clock.clips };
  if (recordedMs >= limit) return { clock: next, close: "finish" };
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

/** Clips reviewed at once. Each takes about 40 seconds and a new one arrives every 30, so one at a time falls behind. */
const CLIPS_IN_FLIGHT = 2;
/** Tries per clip before the Retry button shows. */
export const CLIP_TRIES = 3;

/** Which waiting clips to send now, oldest first, without going over the in-flight limit. */
export function clipsToSend(total: number, done: ReadonlySet<number>, sending: ReadonlySet<number>, limit = CLIPS_IN_FLIGHT) {
  const picked: number[] = [];
  for (let index = 0; index < total && sending.size + picked.length < limit; index += 1) {
    if (!done.has(index) && !sending.has(index)) picked.push(index);
  }
  return picked;
}

/** Results land out of order. They are applied in clip order, so the list matches a one-at-a-time run. */
export function readyInOrder(applied: number, results: ReadonlyMap<number, unknown>) {
  const ready: number[] = [];
  for (let index = applied; results.has(index); index += 1) ready.push(index);
  return ready;
}

export function retryDelayMs(tries: number) {
  return Math.min(6000, 1500 * tries);
}
