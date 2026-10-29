"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { narrationTap, type NarrationTap } from "../lib/scan-audio";

const NOTE_MS = 30_000;
const answerSchema = z.object({ text: z.string().trim().min(1).max(500) });
const errorSchema = z.object({ error: z.string().max(300) });

/** Hold a short spoken note about one line. Muse Voice Transcribe turns it into words; the audio is not kept. */
export function VoiceNote({ inventoryId, onText, disabled }: { inventoryId: string; onText: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "listening" | "sending">("idle");
  const [error, setError] = useState("");
  const [left, setLeft] = useState(NOTE_MS);
  const tapRef = useRef<NarrationTap | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(0);

  function release() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    tapRef.current?.stop();
    tapRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => release, []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const tap = narrationTap(stream);
      if (!tap) {
        stream.getTracks().forEach((track) => track.stop());
        setError("This browser cannot record a note.");
        return;
      }
      streamRef.current = stream;
      tapRef.current = tap;
      tap.setOn(true);
      startedRef.current = Date.now();
      setLeft(NOTE_MS);
      setState("listening");
      timerRef.current = window.setInterval(() => {
        const remaining = NOTE_MS - (Date.now() - startedRef.current);
        setLeft(Math.max(0, remaining));
        if (remaining <= 0) void stop();
      }, 250);
    } catch {
      setError("The microphone is blocked for this site.");
    }
  }

  async function stop() {
    const tap = tapRef.current;
    if (!tap) return;
    tap.setOn(false);
    const audio = tap.take();
    release();
    if (!audio) {
      setState("idle");
      setError("Nothing was heard. Hold it a little longer.");
      return;
    }
    setState("sending");
    try {
      const body = new FormData();
      body.set("audio", new File([audio], "note.wav", { type: "audio/wav" }));
      body.set("inventoryId", inventoryId);
      const response = await fetch("/api/scan/voice", { method: "POST", body });
      const payload: unknown = await response.json().catch(() => null);
      const parsed = answerSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        const failure = errorSchema.safeParse(payload);
        setError(failure.success ? failure.data.error : "The note did not come back. Try again.");
        return;
      }
      onText(parsed.data.text);
    } catch {
      setError("The note did not come back. Try again.");
    } finally {
      setState("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        className={`button quiet line-action${state === "listening" ? " is-listening" : ""}`}
        disabled={disabled || state === "sending"}
        aria-pressed={state === "listening"}
        onClick={() => void (state === "listening" ? stop() : start())}
      >
        {state === "listening" ? `Stop · ${Math.ceil(left / 1000)}s` : state === "sending" ? "Listening back" : "Talk about it"}
      </button>
      {error ? <p className="form-error line-error">{error}</p> : null}
    </>
  );
}
