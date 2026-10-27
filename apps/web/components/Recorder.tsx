"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ADDRESS_MATCH_MILES,
  MAX_SCAN_MS,
  formatClock,
  milesBetween,
  sha256Hex,
} from "../lib/inventory";
import { useInventory } from "./InventoryProvider";
import { Loader } from "./Loader";

type Phase = "idle" | "starting" | "recording" | "saving" | "stopped";

function isAppleTouch() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = isAppleTouch()
    ? ["video/mp4", "video/webm"]
    : ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function prepareVideo(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.disablePictureInPicture = true;
}

function grabFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function Recorder() {
  const router = useRouter();
  const { addClip, sealRecord, selected } = useInventory();
  const [reviewUrl, setReviewUrl] = useState("");
  const reviewBlob = useRef<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<string>("");
  const startedMsRef = useRef(0);
  const frameRef = useRef("");
  const durationRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(MAX_SCAN_MS, now - startedMsRef.current);
      setElapsed(next);
      if (next >= MAX_SCAN_MS) {
        stopRecording();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // stopRecording is stable enough for this tick loop; the timeout path calls the latest close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    const video = videoRef.current;
    if (video) frameRef.current = grabFrame(video);
    durationRef.current = Math.min(MAX_SCAN_MS, performance.now() - startedMsRef.current);
    setPhase("saving");
    recorder.stop();
  }

  async function openStream() {
    const modest = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 24, max: 30 },
    };
    const audio = { echoCancellation: true, noiseSuppression: true };
    const attempts: MediaStreamConstraints[] = [
      { video: { ...modest, facingMode: { ideal: "environment" } }, audio },
      { video: { ...modest, facingMode: "user" }, audio },
      { video: true, audio: true },
    ];
    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function beginScan() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record a scan. The walkthrough has to be captured here, at this moment.");
      return;
    }
    setPhase("starting");
    try {
      const stream = await openStream();
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        prepareVideo(video);
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // The recording can still start if inline playback is delayed.
        }
      }
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        reviewBlob.current = blob;
        const url = URL.createObjectURL(blob);
        setReviewUrl(url);
        setPhase("stopped");
      };
      startedAtRef.current = new Date().toISOString();
      startedMsRef.current = performance.now();
      durationRef.current = 0;
      recorder.start(1000);
      recorderRef.current = recorder;
      setElapsed(0);
      setPhase("recording");
    } catch {
      stopTracks();
      setPhase("idle");
      setError("The camera or microphone is blocked. This scan has to be recorded here, at this moment.");
    }
  }

  async function createInventory() {
    const blob = reviewBlob.current;
    if (!selected || !blob) return;
    setPhase("saving");
    const contentHash = await sha256Hex(await blob.arrayBuffer());
    const clipId = crypto.randomUUID();
    const videoUrl = reviewUrl || URL.createObjectURL(blob);
    addClip({
      id: clipId,
      startedAt: startedAtRef.current,
      durationMs: durationRef.current,
      posterUrl: frameRef.current,
      videoUrl,
      mediaType: blob.type || "video/webm",
      contentHash,
    });
    const sealedAt = new Date().toISOString();
    const recordHash = await sha256Hex(
      JSON.stringify({
        title: selected.title.trim(),
        address: selected.homeAddress.trim(),
        addressLatitude: selected.addressPoint?.latitude ?? null,
        addressLongitude: selected.addressPoint?.longitude ?? null,
        latitude: selected.place?.latitude ?? null,
        longitude: selected.place?.longitude ?? null,
        accuracyMeters: selected.place?.accuracyMeters ?? null,
        locatedAt: selected.place?.capturedAt ?? null,
        scanStartedAt: startedAtRef.current,
        durationMs: durationRef.current,
        clipId,
        contentHash,
        sealedAt,
      }),
    );
    sealRecord(selected.id, recordHash, sealedAt);
    router.push("/");
  }

  const progress = elapsed / MAX_SCAN_MS;
  const miles =
    selected?.place && selected.addressPoint ? milesBetween(selected.place, selected.addressPoint) : null;
  const live = phase === "starting" || phase === "recording";

  if (!selected) return null;

  return (
    <div className="recorder">
      <div className="sheet scan-setup">
        <p className="confirm-title">{selected.title.trim()}</p>
        <p className="confirm-address">{selected.homeAddress.trim()}</p>
        {miles != null && miles <= ADDRESS_MATCH_MILES ? (
          <p className="place-check">Checked. This device is within a mile of the insured property.</p>
        ) : null}
        {miles != null && miles > ADDRESS_MATCH_MILES ? (
          <p className="place-distance">
            {miles < 10 ? miles.toFixed(1) : Math.round(miles)} miles from the insured property. Not checked.
          </p>
        ) : null}
      </div>
      <div className={live ? "preview" : "preview is-waiting"}>
        <video ref={videoRef} muted autoPlay playsInline disablePictureInPicture />
        {phase === "starting" ? (
          <div className="preview-idle">
            <Loader size={72} layout="inline" />
          </div>
        ) : null}
        {phase === "recording" ? <span className="rec-dot" aria-hidden="true" /> : null}
      </div>
      {live ? (
        <>
          <div
            className="record-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Scan time"
          >
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="record-time" aria-live="polite">
            {`${formatClock(elapsed)} of ${formatClock(MAX_SCAN_MS)}`}
          </p>
        </>
      ) : null}
      {phase === "recording" ? (
        <button type="button" className="button brand record-action" onClick={stopRecording}>
          Stop scan
        </button>
      ) : null}
      {phase === "stopped" ? (
        <>
          {reviewUrl ? <video className="preview" src={reviewUrl} controls playsInline /> : null}
          <button type="button" className="button brand record-action" onClick={createInventory}>
            Create inventory
          </button>
        </>
      ) : null}
      {phase === "idle" || phase === "starting" ? (
        <button
          type="button"
          className="button brand record-action"
          onClick={beginScan}
          disabled={phase === "starting"}
        >
          {phase === "starting" ? "Starting" : "Begin scan"}
        </button>
      ) : null}
      {phase === "saving" ? <p className="hint">Sealing the record.</p> : null}
      {live ? (
        <p className="hint">
          Narrate each room and the items in it. Say the room when you enter it. The camera and microphone are on for
          this scan only.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
