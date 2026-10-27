"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAudience } from "./Audience";
import { InsurerInquiry } from "./InsurerInquiry";
import { MarketPitch } from "./MarketPitch";
import { InventoryDocument } from "./InventoryDocument";
import { createBrowserSupabase } from "../lib/supabase/browser";

/** Matches Auth → Sign In / Providers → Email → Email OTP Expiration. */
const CODE_TTL_MS = 10 * 60 * 1000;
const LEAD = "Most people are underinsured.";

export function LoginGate({ email }: { email: string | null }) {
  const { audience, setAudience } = useAudience();
  if (email) return <InventoryDocument />;

  const view = audience;

  return (
    <div className="narrow login" style={{ "--lead": LEAD.length } as React.CSSProperties}>
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
          <span>Create an entire verifiable personal inventory in</span>
          <span className="login-promise-close">
            <span className="login-promise-time">100 seconds</span> and rest assured.
          </span>
        </p>
        {view === null ? <MarketPitch /> : null}
        {view === null ? <AudienceChoice onChoose={setAudience} /> : null}
        {view === "insured" ? <EmailLogin /> : null}
        {view === "provider" ? <InsurerInquiry /> : null}
      </div>
    </div>
  );
}

function AudienceChoice({ onChoose }: { onChoose: (audience: "insured" | "provider") => void }) {
  return (
    <div className="choice">
      <p className="choice-label">Which describes you?</p>
      <button type="button" className="button" onClick={() => onChoose("insured")}>
        I&apos;m getting insurance
      </button>
      <button type="button" className="button quiet" onClick={() => onChoose("provider")}>
        I&apos;m an insurance provider
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
    const supabase = createBrowserSupabase();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    setPending(null);
    if (sendError) {
      const plain = plainAuthError(sendError.message);
      if (plain.retryAfterMs && renewing) {
        setResendAt(Date.now() + plain.retryAfterMs);
        setError("The code already sent still works.");
        return;
      }
      setError(plain.text);
      return;
    }
    focusCode.current = true;
    setNotice(renewing ? "resent" : "sent");
    setCode("");
    setSent(true);
    setResendAt(null);
    setExpiresAt(Date.now() + CODE_TTL_MS);
    setNow(Date.now());
    setStatus(
      renewing
        ? "New code sent. It expires in 10 minutes."
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
    const supabase = createBrowserSupabase();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setPending(null);
    if (verifyError) {
      setError(plainAuthError(verifyError.message).text);
      return;
    }
    window.location.assign("/");
  }

  function useDifferentEmail() {
    if (pending) return;
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
  const visibleError = error === "The code already sent still works." ? "" : error;

  return (
    <>
      {sent ? (
        <form className="stack login-form" onSubmit={verifyCode}>
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
          <label className="field">
            <span>Code</span>
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
          </label>
          {expired ? (
            <button className="button" type="button" onClick={() => void sendCode()} disabled={pending !== null || resendWait > 0}>
              {sendLabel}
            </button>
          ) : (
            <>
              <button className="button" type="submit" disabled={pending !== null || code.trim().length === 0}>
                {pending === "check" ? "Checking" : "Log in"}
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
          {reassurance ? (
            <p className="code-note" role="status">
              The code already sent still works.
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
        <form className="stack login-form" onSubmit={sendCode}>
          <label className="field">
            <span>Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button className="button login-send" type="submit" disabled={pending !== null}>
            {pending === "send" ? "Sending" : "Email me a code"}
          </button>
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

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function plainAuthError(message: string) {
  const wait = /after (\d+) seconds?/i.exec(message);
  if (wait) return { text: "The code already sent still works.", retryAfterMs: Number(wait[1]) * 1000 };
  const lower = message.toLowerCase();
  if (lower.includes("rate")) return { text: "Wait a moment, then send a new code.", retryAfterMs: null };
  if (lower.includes("expired")) return { text: "This code expired. Send a new one.", retryAfterMs: null };
  if (lower.includes("invalid") || lower.includes("otp")) {
    return { text: "That code didn't match. Check the email and try again.", retryAfterMs: null };
  }
  return { text: message, retryAfterMs: null };
}
