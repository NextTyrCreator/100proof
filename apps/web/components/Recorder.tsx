"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addressRegionLabel } from "../lib/address-search";
import { dataUrlBlob, sendEvidence } from "../lib/evidence-client";
import { openRequests, type EvidenceRequest } from "../lib/evidence-requests";
import { formatClock, locationWithin, sha256Hex, type SpokenLine } from "../lib/inventory";
import { keptFromInventories, readKeptValues, rememberKeptValues } from "../lib/kept-values";
import { narrationTap, type NarrationTap } from "../lib/scan-audio";
import { makeRecorder, scaledCapture, type ScaledCapture } from "../lib/scan-capture";
import {
  CLIP_MS,
  SCAN_LIMIT_MS,
  advanceClock,
  afterClip,
  blankClock,
  pauseExpired,
  type CloseReason,
  type SessionClock,
} from "../lib/scan-session";
import { reviewResultSchema, type ReviewResult } from "../lib/review-shape";
import { spokenLineSchema } from "../lib/inventory-record";
import { AddressLine } from "./AddressLine";
import { combinePieceReviews, patchReviewItem, tagReview } from "../lib/inventory-merge";
import { useInventory } from "./InventoryProvider";
import { ItemizedRooms } from "./ItemizedRooms";
import { Loader } from "./Loader";
import { z } from "zod";

type Phase = "idle" | "starting" | "recording" | "paused" | "reviewing" | "reviewed" | "review-failed";

type RecordedPiece = { id: string; blob: Blob; audio: Blob | null; startedAt: string; durationMs: number; posterUrl: string };

const pieceResponseSchema = z.object({ review: reviewResultSchema, spoken: z.array(spokenLineSchema).max(60) });

const CLIP_SLOTS = SCAN_LIMIT_MS / CLIP_MS;

function prepareVideo(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.disablePictureInPicture = true;
}

function grabFrame(video: HTMLVideoElement, quality = 0.72) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 854;
  canvas.height = video.videoHeight || 480;
  const context = canvas.getContext("2d");
  if (!context || canvas.width === 0) return "";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function Recorder({ onBack, focusIds = [] }: { onBack: () => void; focusIds?: string[] }) {
  const router = useRouter();
  const {
    addClip,
    addRoomItem,
    sealRecord,
    selected,
    setScanReview,
    updateRoomItem,
    renameRoom,
    deleteRoomItem,
    inventories,
    saveMedia,
    updateClip,
    applyEvidence,
    skipRequest,
  } = useInventory();
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<ScaledCapture | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const partsRef = useRef<RecordedPiece[]>([]);
  const savedPartsRef = useRef(0);
  const appliedRef = useRef(false);
  const sealedRef = useRef(false);
  const hashesRef = useRef<string[]>([]);
  const combinedRef = useRef<ReviewResult | null>(null);
  const clockRef = useRef<SessionClock>(blankClock());
  const modeRef = useRef<"idle" | "recording" | "paused" | "closing" | "done">("idle");
  const closingRef = useRef<CloseReason | null>(null);
  const lastTickRef = useRef(0);
  const segmentStartedAtRef = useRef("");
  const piecePosterRef = useRef("");
  const pausedAtRef = useRef(0);
  const pumpingRef = useRef(false);
  const hadClipsRef = useRef(false);
  const tapRef = useRef<NarrationTap | null>(null);
  const dismissedRef = useRef(new Set<string>());
  const [needsRetry, setNeedsRetry] = useState(false);
  const [liveAsk, setLiveAsk] = useState<{ clip: number; request: EvidenceRequest } | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [snapNote, setSnapNote] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [clock, setClock] = useState<SessionClock>(blankClock());
  const [error, setError] = useState("");
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    return () => {
      tapRef.current?.stop();
      captureRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    lastTickRef.current = performance.now();
    const timer = window.setInterval(() => {
      if (modeRef.current !== "recording" || closingRef.current) return;
      const now = performance.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      const stepped = advanceClock(clockRef.current, delta);
      clockRef.current = stepped.clock;
      setClock(stepped.clock);
      if (stepped.close) closeClip(stepped.close);
    }, 200);
    return () => window.clearInterval(timer);
    // closeClip is recreated each render and reads refs, so the interval always calls the latest close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== "paused") return;
    const timer = window.setInterval(() => {
      if (modeRef.current === "paused" && pauseExpired(pausedAtRef.current, Date.now())) closeClip("finish");
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function stopCamera() {
    tapRef.current?.stop();
    tapRef.current = null;
    captureRef.current?.stop();
    captureRef.current = null;
    recordStreamRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function rememberReview(review: ReviewResult) {
    const remembered = review.rooms.flatMap((room) =>
      room.items.flatMap((item) => {
        const amount = item.priceUsd;
        if (amount == null || amount < 1) return [];
        const description = [item.itemType, item.brand, item.markings].filter(Boolean).join(" ") || item.name;
        return [{ name: item.name, description, color: item.color, size: item.size, replacementUsd: amount }];
      }),
    );
    rememberKeptValues(remembered);
  }

  function focusNames() {
    const current = selectedRef.current;
    if (!current || focusIds.length === 0) return [];
    return current.rooms
      .flatMap((room) => room.items)
      .filter((item) => focusIds.includes(item.id))
      .map((item) => item.name)
      .slice(0, 10);
  }

  async function postPiece(piece: RecordedPiece, part: number): Promise<{ review: ReviewResult; spoken: SpokenLine[] } | null> {
    const current = selectedRef.current;
    if (!current) return null;
    const body = new FormData();
    const filename = (piece.blob.type || "").includes("mp4") ? `clip-${part}.mp4` : `clip-${part}.webm`;
    body.set("video", new File([piece.blob], filename, { type: piece.blob.type || "video/mp4" }));
    if (piece.audio) body.set("audio", new File([piece.audio], `clip-${part}.wav`, { type: "audio/wav" }));
    body.set("kept", JSON.stringify([...readKeptValues(), ...keptFromInventories(inventories)].slice(-40)));
    body.set("address", current.homeAddress);
    body.set("region", addressRegionLabel(current.addressRegion));
    body.set("part", String(part));
    body.set("parts", "0");
    body.set("focus", JSON.stringify(focusNames()));
    body.set("inventoryId", current.id);
    const response = await fetch("/api/scan/review", { method: "POST", body });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(payload?.error || "A clip did not review. Stay on this page and press retry.");
      return null;
    }
    const parsed = pieceResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setError("A clip did not come back as a list. Stay on this page and press retry.");
      return null;
    }
    return parsed.data;
  }

  /** Keep the clip and its still in the account. A failed upload leaves the clip on this device only. */
  async function keepMedia(inventoryId: string, clipId: string, piece: RecordedPiece) {
    const extension = (piece.blob.type || "").includes("mp4") ? "mp4" : "webm";
    const storagePath = await saveMedia(inventoryId, `${clipId}.${extension}`, piece.blob);
    const poster = piece.posterUrl ? await dataUrlBlob(piece.posterUrl) : null;
    const posterPath = poster ? await saveMedia(inventoryId, `${clipId}.jpg`, poster) : null;
    if (storagePath || posterPath) updateClip(inventoryId, clipId, { storagePath, posterPath });
  }

  function finishSession() {
    const current = selectedRef.current;
    if (!current || appliedRef.current || !combinedRef.current) {
      if (partsRef.current.length === 0) {
        setPhase("paused");
        modeRef.current = "paused";
        setError("Record a clip before you finish.");
      }
      return;
    }
    setScanReview(
      current.id,
      combinedRef.current,
      focusIds.length > 0 ? "focus" : hadClipsRef.current ? "append" : "replace",
      focusIds,
    );
    appliedRef.current = true;
    const sealedAt = new Date().toISOString();
    void sha256Hex(
      JSON.stringify({
        title: current.title.trim(),
        country: addressRegionLabel(current.addressRegion),
        address: current.homeAddress.trim(),
        locatedAt: current.place?.capturedAt ?? null,
        scanStartedAt: partsRef.current[0]?.startedAt ?? sealedAt,
        durationMs: clockRef.current.recordedMs,
        pieceHashes: hashesRef.current,
        sealedAt,
      }),
    ).then((recordHash) => {
      sealRecord(current.id, recordHash, sealedAt);
      sealedRef.current = true;
      setPhase("reviewed");
    });
  }

  function pump() {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    void (async () => {
      let failed = false;
      try {
        while (savedPartsRef.current < partsRef.current.length) {
          const index = savedPartsRef.current;
          const piece = partsRef.current[index];
          if (!piece) break;
          setReviewProgress({ current: index + 1, total: partsRef.current.length });
          if (piece.blob.size > 32 * 1024 * 1024) {
            failed = true;
            setNeedsRetry(true);
            setError("A clip is still too large to review. Pause and record a shorter pass.");
            return;
          }
          const result = await postPiece(piece, index + 1);
          if (!result) {
            failed = true;
            setNeedsRetry(true);
            if (modeRef.current === "done") setPhase("review-failed");
            return;
          }
          const review = tagReview(result.review, piece.id);
          const hash = await sha256Hex(await piece.blob.arrayBuffer());
          hashesRef.current[index] = hash;
          addClip({
            id: piece.id,
            startedAt: piece.startedAt,
            durationMs: piece.durationMs,
            posterUrl: piece.posterUrl,
            videoUrl: URL.createObjectURL(piece.blob),
            mediaType: piece.blob.type || "video/mp4",
            contentHash: hash,
            storagePath: null,
            posterPath: null,
            spoken: result.spoken,
          });
          const inventoryId = selectedRef.current?.id;
          if (inventoryId) void keepMedia(inventoryId, piece.id, piece);
          combinedRef.current = combinedRef.current ? combinePieceReviews(combinedRef.current, review) : review;
          nextAsk(combinedRef.current, index + 1);
          rememberReview(review);
          savedPartsRef.current = index + 1;
          setNeedsRetry(false);
          setError("");
        }
      } catch {
        failed = true;
        setNeedsRetry(true);
        setError("A clip did not review. Stay on this page and press retry.");
        if (modeRef.current === "done") setPhase("review-failed");
      } finally {
        pumpingRef.current = false;
        if (!failed && savedPartsRef.current < partsRef.current.length) {
          pump();
          return;
        }
        if (!failed && modeRef.current === "done") finishSession();
        else if (!failed && (modeRef.current === "paused" || modeRef.current === "recording")) setReviewProgress(null);
      }
    })();
  }

  function startRecorder() {
    const stream = recordStreamRef.current;
    if (!stream) return;
    const recorder = makeRecorder(stream);
    chunksRef.current = [];
    segmentStartedAtRef.current = new Date().toISOString();
    piecePosterRef.current = "";
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstart = () => tapRef.current?.setOn(true);
    recorder.onerror = () => {
      stopCamera();
      modeRef.current = "done";
      setPhase("review-failed");
      setError("The recording did not finish. Scan again.");
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const reason = closingRef.current;
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/mp4" });
      tapRef.current?.setOn(false);
      const audio = tapRef.current?.take() ?? null;
      if (blob.size > 1000) {
        partsRef.current.push({
          id: crypto.randomUUID(),
          blob,
          audio,
          startedAt: segmentStartedAtRef.current,
          durationMs: Math.max(0, clockRef.current.clipMs),
          posterUrl: piecePosterRef.current,
        });
        pump();
      }
      clockRef.current = afterClip(clockRef.current);
      setClock(clockRef.current);
      closingRef.current = null;
      if (reason === "next" && modeRef.current !== "done") {
        modeRef.current = "recording";
        lastTickRef.current = performance.now();
        const next = startRecorder();
        if (next) {
          recorderRef.current = next;
          next.start(1000);
        }
        return;
      }
      if (reason === "pause") {
        modeRef.current = "paused";
        pausedAtRef.current = Date.now();
        setPhase("paused");
        return;
      }
      modeRef.current = "done";
      stopCamera();
      setPhase(partsRef.current.length > 0 ? "reviewing" : "paused");
      if (partsRef.current.length === 0) setError("Record a clip before you finish.");
      else if (savedPartsRef.current >= partsRef.current.length && !pumpingRef.current) finishSession();
    };
    return recorder;
  }

  function closeClip(reason: CloseReason) {
    if (closingRef.current || modeRef.current === "done" || modeRef.current === "idle") return;
    if (reason === "finish" && modeRef.current === "paused") {
      modeRef.current = "done";
      stopCamera();
      setPhase(partsRef.current.length > 0 ? "reviewing" : "paused");
      if (partsRef.current.length === 0) setError("Record a clip before you finish.");
      else if (savedPartsRef.current >= partsRef.current.length && !pumpingRef.current) finishSession();
      return;
    }
    if (modeRef.current !== "recording") return;
    closingRef.current = reason;
    modeRef.current = "closing";
    const video = videoRef.current;
    if (video) piecePosterRef.current = grabFrame(video);
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
    else {
      closingRef.current = null;
      modeRef.current = reason === "pause" ? "paused" : "done";
      setPhase(reason === "pause" ? "paused" : "reviewing");
    }
  }

  async function openStream() {
    const video = {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 24, max: 24 },
    };
    const audio = { echoCancellation: true, noiseSuppression: true };
    const attempts: MediaStreamConstraints[] = [
      { video, audio },
      { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio },
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
    const current = selectedRef.current;
    if (!current?.place) {
      setError("Allow location before the scan. Press Next and accept the request. A scan cannot start without it.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record a scan. The walkthrough has to be captured here, at this moment.");
      return;
    }
    if (!MediaRecorder.isTypeSupported("video/mp4")) {
      setError("This browser cannot record MP4, which the review needs. Use Chrome or Safari and scan again.");
      return;
    }
    setPhase("starting");
    try {
      const stream = await openStream();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("preview");
      prepareVideo(video);
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // The recording can still start if inline playback is delayed.
      }
      const scaled = scaledCapture(video, stream);
      captureRef.current = scaled;
      tapRef.current = narrationTap(stream);
      recordStreamRef.current = scaled?.stream ?? stream;
      dismissedRef.current.clear();
      setLiveAsk(null);
      setSnapNote("");
      partsRef.current = [];
      savedPartsRef.current = 0;
      appliedRef.current = false;
      sealedRef.current = false;
      hashesRef.current = [];
      combinedRef.current = null;
      hadClipsRef.current = current.clips.length > 0;
      clockRef.current = blankClock();
      setClock(clockRef.current);
      const recorder = startRecorder();
      if (!recorder) throw new Error("recorder");
      recorderRef.current = recorder;
      modeRef.current = "recording";
      lastTickRef.current = performance.now();
      try {
        recorder.start(1000);
      } catch {
        if (!scaled) throw new Error("recorder");
        scaled.stop();
        captureRef.current = null;
        recordStreamRef.current = stream;
        const again = startRecorder();
        if (!again) throw new Error("recorder");
        recorderRef.current = again;
        again.start(1000);
      }
      setPhase("recording");
    } catch {
      stopCamera();
      modeRef.current = "idle";
      setPhase("idle");
      setError("The camera or microphone is blocked. This scan has to be recorded here, at this moment.");
    }
  }

  function resumeScan() {
    if (modeRef.current !== "paused") return;
    setError("");
    const recorder = startRecorder();
    if (!recorder) return;
    recorderRef.current = recorder;
    modeRef.current = "recording";
    lastTickRef.current = performance.now();
    recorder.start(1000);
    setPhase("recording");
  }

  function retryReview() {
    setNeedsRetry(false);
    setError("");
    if (modeRef.current === "done") setPhase("reviewing");
    pump();
  }

  function nextAsk(review: ReviewResult, clip: number) {
    const top = openRequests(review.rooms).find((request) => !dismissedRef.current.has(request.key));
    setLiveAsk(top ? { clip, request: top } : null);
  }

  function dismissAsk() {
    if (!liveAsk) return;
    dismissedRef.current.add(liveAsk.request.key);
    setSnapNote("");
    if (combinedRef.current) nextAsk(combinedRef.current, liveAsk.clip);
  }

  /** A full-resolution frame from the camera, checked against the line that asked for it. */
  async function snapForAsk() {
    const ask = liveAsk;
    const video = videoRef.current;
    const current = selectedRef.current;
    const combined = combinedRef.current;
    if (!ask || !video || !current || !combined) return;
    const item = combined.rooms.flatMap((room) => room.items).find((entry) => entry.id === ask.request.itemId);
    if (!item) return;
    const blob = await dataUrlBlob(grabFrame(video, 0.9));
    if (!blob) return;
    setSnapping(true);
    setSnapNote("");
    const kind = ask.request.kind === "receipt" ? "receipt" : "label";
    const result = await sendEvidence({
      kind,
      item,
      image: blob,
      answer: "",
      address: current.homeAddress,
      region: addressRegionLabel(current.addressRegion),
      inventoryId: current.id,
    });
    if ("error" in result) {
      setSnapping(false);
      setSnapNote(result.error);
      return;
    }
    const photoPath = await saveMedia(current.id, `${item.id}-${crypto.randomUUID().slice(0, 8)}.jpg`, blob);
    setSnapping(false);
    combinedRef.current = patchReviewItem(
      combinedRef.current ?? combined,
      item.id,
      { ...result.patch, photoPath, photoUrl: URL.createObjectURL(blob) },
      kind === "receipt" ? "receipt photo" : "label photo",
      photoPath,
    );
    const settled = kind === "label" ? result.patch.identitySettled === true : result.patch.userValueUsd != null;
    if (!settled) dismissedRef.current.add(ask.request.key);
    setSnapNote(
      settled
        ? `Got it. The ${item.name.toLowerCase()} line is updated.`
        : "That did not settle it. Get closer and snap again from the list when you finish.",
    );
    nextAsk(combinedRef.current, ask.clip);
  }

  const live = phase === "starting" || phase === "recording" || phase === "paused";
  const within = selected ? locationWithin(selected) : null;
  const clipNumber = Math.min(CLIP_SLOTS, clock.clips + (phase === "recording" ? 1 : 0));

  if (!selected) return null;

  return (
    <div className="recorder">
      <div className="sheet scan-setup">
        {phase === "idle" ? (
          <button type="button" className="back-arrow" onClick={onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12 H6 M11 6 L5 12 L11 18" />
            </svg>
            <span className="sr-only">Back</span>
          </button>
        ) : null}
        <p className="confirm-title">{selected.title.trim()}</p>
        {addressRegionLabel(selected.addressRegion) ? (
          <p className="confirm-address">{addressRegionLabel(selected.addressRegion)}</p>
        ) : null}
        <AddressLine address={selected.homeAddress.trim()} within={within} />
        {selected.clips.length > 0 && phase === "idle" ? (
          <p className="hint">This scan adds to the inventory. Scanning the same room again can repeat a line. Delete the extra.</p>
        ) : null}
      </div>
      {live ? (
        <div className="preview">
          <video ref={videoRef} muted autoPlay playsInline disablePictureInPicture />
          {phase === "starting" ? (
            <div className="preview-idle">
              <Loader size={72} layout="inline" />
            </div>
          ) : null}
          {phase === "recording" ? <span className="rec-dot" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {live ? (
        <>
          <div className="clip-rail" aria-hidden="true">
            {Array.from({ length: CLIP_SLOTS }, (_, index) => {
              const start = index * CLIP_MS;
              const amount = Math.min(1, Math.max(0, (clock.recordedMs - start) / CLIP_MS));
              return (
                <span className="clip-mark" key={index}>
                  <span style={{ transform: `scaleX(${amount})` }} />
                </span>
              );
            })}
          </div>
          <p className="record-time" aria-live="polite">
            {phase === "recording"
              ? `Clip ${clipNumber} · ${formatClock(clock.clipMs)} of 0:30 · ${formatClock(clock.recordedMs)} of ${formatClock(SCAN_LIMIT_MS)}`
              : `Paused · ${formatClock(clock.recordedMs)} of ${formatClock(SCAN_LIMIT_MS)}`}
          </p>
        </>
      ) : null}
      {phase === "recording" ? (
        <div className="record-controls">
          <button type="button" className="button brand" onClick={() => closeClip("pause")}>
            Pause
          </button>
          <button type="button" className="button quiet" onClick={() => closeClip("finish")}>
            Done
          </button>
        </div>
      ) : null}
      {phase === "paused" ? (
        <div className="record-controls">
          <button type="button" className="button brand" onClick={resumeScan}>
            Record
          </button>
          <button type="button" className="button quiet" onClick={() => closeClip("finish")}>
            Done
          </button>
        </div>
      ) : null}
      {phase === "reviewing" ? (
        <>
          <div className="preview" role="status">
            <div className="preview-idle">
              <Loader size={72} layout="inline" />
            </div>
          </div>
          <p className="hint">
            {reviewProgress
              ? `Reviewing clip ${reviewProgress.current} of ${reviewProgress.total}. Nothing is listed until the clips finish, in order.`
              : "Reviewing the clips in order. Nothing is listed until this finishes."}
          </p>
        </>
      ) : null}
      {live && reviewProgress ? (
        <p className="hint">{`Reviewing clip ${reviewProgress.current} while you keep filming.`}</p>
      ) : null}
      {live && liveAsk ? (
        <div className="ask-live" role="status" aria-live="polite">
          <p className="ask-from">Clip {liveAsk.clip} asks</p>
          <p className="ask-prompt">{liveAsk.request.prompt}</p>
          <p className="ask-why">{liveAsk.request.why}</p>
          <div className="ask-actions">
            {liveAsk.request.kind === "label" || liveAsk.request.kind === "receipt" ? (
              <button type="button" className="button quiet" onClick={() => void snapForAsk()} disabled={snapping}>
                {snapping ? "Checking" : "Snap it"}
              </button>
            ) : null}
            <button type="button" className="text-button" onClick={dismissAsk}>
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {live && snapNote ? <p className="hint">{snapNote}</p> : null}
      {phase === "reviewed" && selected ? (
        <>
          <ItemizedRooms
            inventoryId={selected.id}
            rooms={selected.rooms}
            address={selected.homeAddress}
            region={addressRegionLabel(selected.addressRegion)}
            onRenameRoom={renameRoom}
            onDeleteItem={deleteRoomItem}
            onUpdateItem={updateRoomItem}
            onAddItem={addRoomItem}
            clips={selected.clips}
            onEvidence={applyEvidence}
            onSkip={skipRequest}
            onSaveMedia={saveMedia}
          />
          <button type="button" className="button brand record-action" onClick={() => router.push("/")}>
            My inventory
          </button>
        </>
      ) : null}
      {needsRetry ? (
        <button type="button" className="button brand record-action" onClick={retryReview}>
          Retry
        </button>
      ) : null}
      {phase === "idle" || phase === "starting" ? (
        <button type="button" className="button brand record-action" onClick={beginScan} disabled={phase === "starting"}>
          {phase === "starting" ? "Starting" : "Begin scan"}
        </button>
      ) : null}
      {live ? (
        <p className="hint">
          {phase === "paused"
            ? "Record to continue. If this sits for 15 minutes, the session sends what you have."
            : "Narrate each room as you enter it. A clip closes every 30 seconds. Pause when you need to, then record again."}
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
