/** In-memory sign-in limits. A code is never stored here. */

const SEND_GAP_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;
const SENDS_PER_HOUR = 5;
const IP_SENDS_PER_HOUR = 20;
const MAX_GUESSES = 5;
const GUESS_LOCK_MS = 15 * 60 * 1000;

type EmailState = {
  sends: number[];
  guesses: number;
  lockedUntil: number;
};

const emails = new Map<string, EmailState>();
const ips = new Map<string, number[]>();

type CodeWait = {
  ok: false;
  retryAfterMs: number;
  reason: "wait" | "locked";
};

function key(email: string) {
  return email.trim().toLowerCase();
}

function row(email: string) {
  const id = key(email);
  const current = emails.get(id);
  if (current) return current;
  const created: EmailState = { sends: [], guesses: 0, lockedUntil: 0 };
  emails.set(id, created);
  return created;
}

function recent(times: number[], now: number) {
  return times.filter((time) => now - time < HOUR_MS);
}

function sweep(now: number) {
  for (const [id, state] of emails) {
    state.sends = recent(state.sends, now);
    if (state.sends.length === 0 && state.lockedUntil <= now && state.guesses === 0) emails.delete(id);
  }
  for (const [ip, times] of ips) {
    const kept = recent(times, now);
    if (kept.length === 0) ips.delete(ip);
    else ips.set(ip, kept);
  }
}

/** A new code may replace the previous one once a minute, and only five times an hour. */
export function allowCodeSend(email: string, ip: string, now = Date.now()): { ok: true } | CodeWait {
  sweep(now);
  const state = row(email);
  state.sends = recent(state.sends, now);
  if (state.sends.length >= SENDS_PER_HOUR) {
    return { ok: false, retryAfterMs: Math.max(1000, state.sends[0] + HOUR_MS - now), reason: "locked" };
  }
  const last = state.sends[state.sends.length - 1];
  if (last !== undefined && now - last < SEND_GAP_MS) {
    return { ok: false, retryAfterMs: SEND_GAP_MS - (now - last), reason: "wait" };
  }
  const ipSends = recent(ips.get(ip) ?? [], now);
  ips.set(ip, ipSends);
  if (ipSends.length >= IP_SENDS_PER_HOUR) {
    return { ok: false, retryAfterMs: Math.max(1000, ipSends[0] + HOUR_MS - now), reason: "locked" };
  }
  return { ok: true };
}

export function rememberCodeSent(email: string, ip: string, now = Date.now()) {
  const state = row(email);
  const replacesPrevious = state.sends.length > 0;
  state.sends.push(now);
  state.guesses = 0;
  state.lockedUntil = 0;
  const ipSends = recent(ips.get(ip) ?? [], now);
  ipSends.push(now);
  ips.set(ip, ipSends);
  return replacesPrevious;
}

export function allowCodeGuess(email: string, now = Date.now()): { ok: true } | CodeWait {
  const state = row(email);
  if (state.lockedUntil > now) {
    return { ok: false, retryAfterMs: state.lockedUntil - now, reason: "locked" };
  }
  return { ok: true };
}

export function rememberCodeGuess(email: string, matched: boolean, now = Date.now()) {
  const state = row(email);
  if (matched) {
    state.guesses = 0;
    state.lockedUntil = 0;
    return;
  }
  state.guesses += 1;
  if (state.guesses >= MAX_GUESSES) state.lockedUntil = now + GUESS_LOCK_MS;
}

export function clientIp(request: Request) {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare.slice(0, 64);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  return "unknown";
}
