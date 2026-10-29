"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAudience } from "./Audience";
import { InsurerInquiry } from "./InsurerInquiry";
import { InventoryDocument } from "./InventoryDocument";

/** Matches Auth → Sign In / Providers → Email → Email OTP Expiration. */
const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_GAP_MS = 60_000;
const PENDING_KEY = "100proof.email-code";
const LEAD = "Most people are underinsured.";

type PendingCode = { email: string; expiresAt: number; sentAt: number };

function readPending(): PendingCode | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "") as Partial<PendingCode>;
    if (typeof parsed.email !== "string" || typeof parsed.expiresAt !== "number" || typeof parsed.sentAt !== "number") return null;
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return { email: parsed.email, expiresAt: parsed.expiresAt, sentAt: parsed.sentAt };
  } catch {
    return null;
  }
}

function writePending(pending: PendingCode) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

function clearPending() {
  sessionStorage.removeItem(PENDING_KEY);
}

export function LoginGate({ email }: { email: string | null }) {
  const { audience, setAudience } = useAudience();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("for") === "providers") setAudience("provider");
  }, [setAudience]);

  if (email) return <InventoryDocument />;

  if (audience === "provider") {
    return (
      <div className="narrow login is-provider">
        <AudienceSwitch />
        <InsurerInquiry />
      </div>
    );
  }

  return (
    <div className="narrow login" style={{ "--lead": LEAD.length } as React.CSSProperties}>
      <AudienceSwitch />
      <h1>
        <span className="sr-only">Most people are underinsured. Don&apos;t be like them.</span>
        <span className="login-letters" aria-hidden="true">
          {LEAD.split(" ").map((word, wordIndex, words) => {
            const start = words.slice(0, wordIndex).join(" ").length + (wordIndex === 0 ? 0 : 1);
            return (
              <span key={word} className="login-word">
                {Array.from(word).map((char, offset) => (
                  <span key={start + offset} style={{ "--i": start + offset } as React.CSSProperties}>
                    {char}
                  </span>
                ))}
                {wordIndex < words.length - 1 ? "\u00a0" : null}
              </span>
            );
          })}
        </span>
        <span className="login-line-next" aria-hidden="true">
          Don&apos;t be like them.
        </span>
      </h1>
      <div className="login-rest">
        <p className="login-promise">
            <span>Take a video. Get an automated inventory with</span>
            <span className="login-promise-close">
              <span className="login-promise-time">verified proof</span>, and insure it properly.
            </span>
        </p>
        <EmailLogin />
      </div>
    </div>
  );
}

/** On a phone the audience tabs live in the menu, so the choice is repeated on the page. */
function AudienceSwitch() {
  const { audience, setAudience } = useAudience();

  function choose(next: "insured" | "provider") {
    setAudience(next);
    window.history.replaceState(null, "", next === "provider" ? "/?for=providers" : "/");
  }

  return (
    <div className="audience-switch" role="group" aria-label="Who this is for">
      <button type="button" aria-pressed={audience === "insured"} onClick={() => choose("insured")}>
        For insured
      </button>
      <button type="button" aria-pressed={audience === "provider"} onClick={() => choose("provider")}>
        For providers
      </button>
    </div>
  );
}

function EmailLogin() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<"sent" | "resent">("sent");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [holdNote, setHoldNote] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const focusCode = useRef(false);
  const expiredNoted = useRef(false);

  const remaining = expiresAt === null ? 0 : Math.max(0, expiresAt - now);
  const expired = sent && expiresAt !== null && remaining === 0;
  const resendWait = resendAt === null ? 0 : Math.max(0, resendAt - now);
  const life = expiresAt === null ? 0 : Math.min(1, remaining / CODE_TTL_MS);

  useEffect(() => {
    const saved = readPending();
    if (!saved) return;
    setEmail(saved.email);
    setSent(true);
    setExpiresAt(saved.expiresAt);
    if (saved.sentAt + SEND_GAP_MS > Date.now()) setResendAt(saved.sentAt + SEND_GAP_MS);
  }, []);

  useEffect(() => {
    if (expiresAt === null) return;
    expiredNoted.current = false;
    const tick = () => {
      const next = Date.now();
      setNow(next);
      if (next >= expiresAt) {
        if (expiredNoted.current) return;
        expiredNoted.current = true;
        setStatus("This code expired. Send a new code.");
        setError("");
        return;
      }
      if (expiresAt - next <= 60_000) {
        setStatus((current) => (current === "One minute left." ? current : "One minute left."));
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!focusCode.current) return;
    focusCode.current = false;
    codeRef.current?.focus();
  }, [expiresAt, sent]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (pending || resendWait > 0) return;
    const renewing = sent;
    setError("");
    setPending("send");
    let response: Response;
    try {
      response = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      setPending(null);
      setError("The code could not be sent. Try again.");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      replacesPrevious?: boolean;
      retryAfterMs?: number;
      reason?: "wait" | "locked";
      error?: string;
    } | null;
    setPending(null);
    if (!response.ok || !payload?.ok) {
      if (payload?.retryAfterMs && payload.reason === "wait") {
        const retryAfterMs = payload.retryAfterMs;
        const age = Math.max(0, SEND_GAP_MS - retryAfterMs);
        const nextExpires = Date.now() + CODE_TTL_MS - age;
        const keptExpires = expiresAt ?? nextExpires;
        setSent(true);
        setExpiresAt((current) => current ?? nextExpires);
        setHoldNote(true);
        setResendAt(Date.now() + retryAfterMs);
        setStatus("This code works until a new one is sent.");
        writePending({ email: email.trim(), expiresAt: keptExpires, sentAt: Date.now() - age });
        return;
      }
      if (payload?.reason === "locked") {
        setError("Too many codes were sent. Wait, then try again.");
        if (payload.retryAfterMs) setResendAt(Date.now() + payload.retryAfterMs);
        return;
      }
      setError(payload?.error || "The code could not be sent. Try again.");
      return;
    }
    setHoldNote(false);
    const sentAt = Date.now();
    const nextExpires = sentAt + CODE_TTL_MS;
    focusCode.current = true;
    setNotice(payload.replacesPrevious || renewing ? "resent" : "sent");
    setCode("");
    setSent(true);
    setResendAt(sentAt + SEND_GAP_MS);
    setExpiresAt(nextExpires);
    setNow(sentAt);
    writePending({ email: email.trim(), expiresAt: nextExpires, sentAt });
    setStatus(
      payload.replacesPrevious || renewing
        ? "New code sent. The previous code no longer works. It expires in 10 minutes."
        : "Code sent. It expires in 10 minutes.",
    );
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (expiresAt !== null && Date.now() >= expiresAt) {
      setError("");
      setStatus("This code expired. Send a new code.");
      return;
    }
    setError("");
    setPending("check");
    let response: Response;
    try {
      response = await fetch("/api/auth/code/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
    } catch {
      setPending(null);
      setError("That code could not be checked. Try again.");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      reason?: "locked";
      retryAfterMs?: number;
    } | null;
    setPending(null);
    if (!response.ok || !payload?.ok) {
      if (payload?.reason === "locked") {
        setError("Too many tries. Wait, then send a new code.");
        return;
      }
      setError(payload?.error || "That code didn't match. Check the email and try again.");
      return;
    }
    clearPending();
    window.location.assign("/");
  }

  function useDifferentEmail() {
    if (pending) return;
    clearPending();
    setSent(false);
    setCode("");
    setExpiresAt(null);
    setResendAt(null);
    setError("");
    setStatus("");
  }

  const sendLabel =
    pending === "send" ? "Sending" : resendWait > 0 ? `New code in ${formatRemaining(resendWait)}` : "Send a new code";
  const reassurance = resendWait > 0;
  const visibleError = error;

  return (
    <>
      {sent ? (
        <form className="stack login-form login-cta-card login-code-card" onSubmit={verifyCode}>
          <LoginSteps current={1} />
          <div className="code-status">
            <p className="code-sent">
              {notice === "resent" ? "New code sent to " : "Code sent to "}
              <span>{email.trim()}</span>
            </p>
            <div className="code-life" aria-hidden="true">
              <span style={{ transform: `scaleX(${life})` }} />
            </div>
            <p className={expired ? "code-clock is-expired" : "code-clock"}>
              {expired ? "This code expired." : `Expires in ${formatRemaining(remaining)}`}
            </p>
            {expired ? null : (
              <p className="hint">You can also open the link in that email on this device.</p>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {status}
          </p>
          <label className="field login-code-field">
            <span>6-digit code</span>
            <span className="login-email-field">
              <input
                ref={codeRef}
                className="code-input"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                spellCheck={false}
                maxLength={10}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={expired || pending === "send"}
                required={!expired}
              />
            </span>
          </label>
          {expired ? (
            <button className="button" type="button" onClick={() => void sendCode()} disabled={pending !== null || resendWait > 0}>
              {sendLabel}
            </button>
          ) : (
            <>
              <button className="button login-send" type="submit" disabled={pending !== null || code.trim().length === 0}>
                <span>{pending === "check" ? "Checking" : "Log in"}</span>
                {pending === "check" ? null : (
                  <svg className="login-send-icon" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4 10h11M11 5l5 5-5 5" />
                  </svg>
                )}
              </button>
              <button
                className="button quiet"
                type="button"
                onClick={() => void sendCode()}
                disabled={pending !== null || resendWait > 0}
              >
                {sendLabel}
              </button>
            </>
          )}
          {holdNote && reassurance && !expired ? (
            <p className="code-note" role="status">
              This code works until a new one is sent. A new code replaces it in {formatRemaining(resendWait)}.
            </p>
          ) : null}
          {visibleError ? (
            <p className="form-error" role="alert">
              {visibleError}
            </p>
          ) : null}
          <button className="text-button" type="button" onClick={useDifferentEmail} disabled={pending !== null}>
            Use a different email
          </button>
        </form>
      ) : (
        <form className="stack login-form login-cta-card" onSubmit={sendCode}>
          <LoginSteps current={0} />
          <label className="login-cue" htmlFor="login-email">
            <span className="login-cue-copy">
              Enter your email to{" "}
              <span className="login-cue-highlight">create your verifiable inventory now</span>
            </span>
            <svg className="login-cue-arrow" viewBox="0 0 112 76" aria-hidden="true">
              <defs>
                <linearGradient id="proof-cue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--proof-blue)" />
                  <stop offset="52%" stopColor="var(--proof-cyan)" />
                  <stop offset="100%" stopColor="var(--proof-teal)" />
                </linearGradient>
                <linearGradient id="proof-cue-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--proof-cyan)" stopOpacity="0" />
                  <stop offset="55%" stopColor="var(--proof-cyan)" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="var(--proof-teal)" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              <path
                className="login-cue-knockout"
                pathLength={100}
                d="M8 12 C 58 2, 102 18, 92 46 C 85 63, 56 66, 30 60"
              />
              <path
                className="login-cue-knockout-head"
                pathLength={100}
                d="M44 49 L 25 60 L 45 70"
              />
              <path
                className="login-cue-halo"
                pathLength={100}
                d="M8 12 C 58 2, 102 18, 92 46 C 85 63, 56 66, 30 60"
              />
              <path
                className="login-cue-shaft"
                pathLength={100}
                d="M8 12 C 58 2, 102 18, 92 46 C 85 63, 56 66, 30 60"
              />
              <path
                className="login-cue-pulse"
                pathLength={100}
                d="M8 12 C 58 2, 102 18, 92 46 C 85 63, 56 66, 30 60"
              />
              <path
                className="login-cue-head"
                pathLength={100}
                d="M44 49 L 25 60 L 45 70"
              />
              <circle className="login-cue-target" cx="24" cy="60" r="4.5" />
            </svg>
          </label>
          <div className="field login-email-field">
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter your email address..."
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <button className="button login-send" type="submit" disabled={pending !== null}>
            <span>{pending === "send" ? "Sending" : "Begin"}</span>
            {pending === "send" ? null : (
              <svg className="login-send-icon" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 10h11M11 5l5 5-5 5" />
              </svg>
            )}
          </button>
          <p className="hint login-next">Instant 6-digit code · No password · Free to start</p>
          {visibleError ? (
            <p className="form-error" role="alert">
              {visibleError}
            </p>
          ) : null}
        </form>
      )}
    </>
  );
}

const STEPS = ["Email", "Code", "Scan"];

function LoginSteps({ current }: { current: number }) {
  return (
    <ol className="login-steps" aria-label={`Step ${current + 1} of ${STEPS.length}`}>
      {STEPS.map((step, index) => (
        <li key={step} className={index === current ? "is-current" : index < current ? "is-done" : undefined}>
          <span className="login-step-number">{index + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

