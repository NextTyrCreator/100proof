"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addressRegionLabel } from "../lib/address-search";
import { dataUrlBlob, sendEvidence } from "../lib/evidence-client";
import { modelRecognized } from "../lib/review-shape";
import { openRequests, type EvidenceRequest } from "../lib/evidence-requests";
import { formatClock, sha256Hex, type SpokenLine } from "../lib/inventory";
import { keptFromInventories, readKeptValues, rememberKeptValues } from "../lib/kept-values";
import { narrationTap, type NarrationTap } from "../lib/scan-audio";
import { makeRecorder, scaledCapture, type ScaledCapture } from "../lib/scan-capture";
import { DEMO_ROOMS, MORE_ROOMS, ROOM_NOT_SET, roomAt, withMarker, withoutTappedFolds, type RoomHint, type RoomMarker, type RoomQuestion } from "../lib/scan-rooms";
import {
  ADD_LIMIT_MS,
  CLIP_MS,
  CLIP_TRIES,
  SCAN_LIMIT_MS,
  advanceClock,
  afterClip,
  blankClock,
  clipsToSend,
  pauseExpired,
  readyInOrder,
  retryDelayMs,
  type CloseReason,
  type SessionClock,
} from "../lib/scan-session";
import { applyPrices, applyReconcile, joinRepeatPair, joinSurePairs, knownSoFar, linesToPrice, reconcileInput, shareKnownPrices } from "../lib/scan-pipeline";
import type { LineToPrice } from "../lib/review-scan";
import { notHereKey, withoutNotHere, type BelongsQuestion } from "../lib/belongs";
import { reviewResultSchema, type PricedLine, type ReviewResult } from "../lib/review-shape";
import { spokenLineSchema } from "../lib/inventory-record";
import { combinePieceReviews, moveClipLines, patchReviewItem, tagReview } from "../lib/inventory-merge";
import { crossPairs, pairKey, repeatPairs, repeatQuestions, type RepeatQuestion } from "../lib/repeat-match";
import { askSameObject, photoBlob, verdictText } from "../lib/same-object-client";
import type { IdentityCheck } from "../lib/identity-check";
import { compareReads, needsReadTwice, withIdentityCheck } from "../lib/read-twice";
import { askReadTwice } from "../lib/read-twice-client";
import { compareWalks, type WalkCompare } from "../lib/walk-compare";
import { blankScanStats, type ScanStats } from "../lib/scan-stats";
import { useInventory } from "./InventoryProvider";
import { ItemizedRooms } from "./ItemizedRooms";
import { Loader } from "./Loader";
import { ScanGlance } from "./ScanGlance";
import { z } from "zod";

type Phase = "idle" | "starting" | "recording" | "paused" | "reviewing" | "reviewed" | "review-failed";

type Facing = "environment" | "user";

type ZoomRange = { min: number; max: number; step: number };

/** Optical zoom is a camera capability, not in lib.dom yet. Null when this camera cannot zoom. */
function zoomRangeOf(track: MediaStreamTrack | undefined): ZoomRange | null {
  if (!track || typeof track.getCapabilities !== "function") return null;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { zoom?: { min?: number; max?: number; step?: number } };
  const zoom = caps.zoom;
  if (!zoom || typeof zoom.min !== "number" || typeof zoom.max !== "number" || zoom.max <= zoom.min) return null;
  const span = zoom.max - zoom.min;
  const step = Math.max(zoom.step && zoom.step > 0 ? zoom.step : 0, span / 10);
  return { min: zoom.min, max: zoom.max, step };
}

function currentZoom(track: MediaStreamTrack | undefined, range: ZoomRange) {
  const settings = track?.getSettings?.() as (MediaTrackSettings & { zoom?: number }) | undefined;
  const value = settings?.zoom;
  return typeof value === "number" ? Math.min(range.max, Math.max(range.min, value)) : range.min;
}

function videoConstraints(facing: Facing): MediaTrackConstraints {
  return {
    facingMode: facing === "environment" ? { ideal: "environment" } : { exact: "user" },
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 24, max: 24 },
  };
}

type RecordedPiece = {
  id: string;
  blob: Blob;
  audio: Blob | null;
  startedAt: string;
  durationMs: number;
  posterUrl: string;
  rooms: RoomMarker[];
};

type PieceResult = { review: ReviewResult; spoken: SpokenLine[]; roomHint?: RoomHint | null };

/** A room change the listing saw with no tap. Asked once; nothing moves until the person says so. */
type RoomPrompt = RoomQuestion;

type RepeatPrompt = RepeatQuestion & { checking: boolean; cross: boolean };

/** At most this many photo comparisons in one scan. The rest are asked without one. */
const PHOTO_CHECKS_PER_SCAN = 12;
/** At most this many lines read twice in one scan, two calls each. */
const READ_TWICE_PER_SCAN = 15;

type PieceOutcome = { ok: true; result: PieceResult } | { ok: false; error: string; retry: boolean };

const belongsResponseSchema = z.object({
  questions: z
    .array(z.object({ thing: z.string().trim().min(1).max(40), question: z.string().trim().min(1).max(120), reason: z.string().max(100) }))
    .max(3),
});

const pieceResponseSchema = z.object({
  review: reviewResultSchema,
  spoken: z.array(spokenLineSchema).max(60),
  roomHint: z
    .object({ room: z.string().trim().min(1).max(80), atSec: z.number().finite().nonnegative().max(600) })
    .nullable()
    .optional()
    .catch(null),
});
const pieceErrorSchema = z.object({ error: z.string().max(300).optional(), retry: z.boolean().optional() });
const priceResponseSchema = z.object({
  priced: z
    .array(
      z.object({
        key: z.string().max(80),
        replacementUsd: z.number().finite().nonnegative().max(1_000_000).nullable(),
        basis: z.string().max(300),
        sourceUrl: z.string().max(300).nullable(),
      }),
    )
    .max(60),
});
const reconcileResponseSchema = z.object({
  same: z.array(z.array(z.string().max(80)).max(8)).max(60),
  rooms: z.array(z.object({ from: z.string().max(80), to: z.string().max(80) })).max(30),
  fix: z
    .array(z.object({ id: z.string().max(80), category: z.string().max(40) }))
    .max(100)
    .optional()
    .catch(undefined),
  marks: z
    .array(
      z.object({
        id: z.string().max(80),
        brand: z.string().max(80).nullable().optional(),
        markings: z.string().max(160).nullable().optional(),
        serial: z.string().max(80).nullable().optional(),
        color: z.string().max(40).nullable().optional(),
        detail: z.string().max(400).nullable().optional(),
      }),
    )
    .max(100)
    .optional()
    .catch(undefined),
});

const PRICE_BATCH = 8;

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

function grabStill(video: HTMLVideoElement) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return Promise.resolve(null);
  const scale = Math.min(1, 1280 / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82));
}

function lineCount(review: ReviewResult | null) {
  return review ? review.rooms.reduce((sum, room) => sum + room.items.length, 0) : 0;
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * The scan camera. With `autoStart` the camera opens as soon as it mounts, so the wizard's
 * "Begin scan" is the only start button. Without it (adding to an inventory) it waits for its own.
 */
export function Recorder({ onBack, focusIds = [], autoStart = false }: { onBack: () => void; focusIds?: string[]; autoStart?: boolean }) {
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
    markProcessing,
    addRoomQuestions,
    answerRoomQuestion,
    addRepeatQuestions,
    answerRepeatQuestion,
    setRepeatCheck,
    joinLines,
    setIdentityCheck,
    resolveIdentityCheck,
    setWalkCompare,
    saveScanStats,
  } = useInventory();
  const roomNoteTimerRef = useRef<number | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<ScaledCapture | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const partsRef = useRef<RecordedPiece[]>([]);
  /** Clips listed and folded into the session, in order. */
  const appliedCountRef = useRef(0);
  const resultsRef = useRef(new Map<number, PieceResult>());
  const sendingRef = useRef(new Set<number>());
  const failedRef = useRef(false);
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());
  const pricingRef = useRef({ running: false, sent: new Set<string>() });
  const finalizingRef = useRef(false);
  const savedToInventoryRef = useRef(false);
  const hashesRef = useRef<string[]>([]);
  const combinedRef = useRef<ReviewResult | null>(null);
  const clockRef = useRef<SessionClock>(blankClock());
  const limitRef = useRef(SCAN_LIMIT_MS);
  const modeRef = useRef<"idle" | "recording" | "paused" | "closing" | "done">("idle");
  const closingRef = useRef<CloseReason | null>(null);
  const lastTickRef = useRef(0);
  const segmentStartedAtRef = useRef("");
  const segmentIdRef = useRef("");
  const stillsRef = useRef(new Map<string, { at: number; blob: Blob }[]>());
  const piecePosterRef = useRef("");
  const pausedAtRef = useRef(0);
  const hadClipsRef = useRef(false);
  const tapRef = useRef<NarrationTap | null>(null);
  const dismissedRef = useRef(new Set<string>());
  const facingRef = useRef<Facing>("environment");
  const autoStartedRef = useRef(false);
  const [facing, setFacing] = useState<Facing>("environment");
  const [flipping, setFlipping] = useState(false);
  const roomRef = useRef<string | null>(null);
  const markersRef = useRef<RoomMarker[]>([]);
  const [room, setRoom] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  /** Waiting room-change questions, oldest first. The ref is what saving reads, so none is lost. */
  const roomPromptsRef = useRef<RoomPrompt[]>([]);
  const [roomPrompts, setRoomPromptsState] = useState<RoomPrompt[]>([]);
  const [roomNoteText, setRoomNoteText] = useState("");
  /** Rooms the person said no to since their last tap, so the same prompt does not come back. */
  const declinedRoomsRef = useRef(new Set<string>());
  const roomPrompt = roomPrompts[0] ?? null;

  function setRoomPrompts(next: RoomPrompt[]) {
    roomPromptsRef.current = next;
    setRoomPromptsState(next);
  }

  /**
   * Possible repeats found while filming, oldest first, each with Muse Spark 1.3's photo comparison once
   * it is back. A cross pair is a new line against a line already saved on a Scan more inventory.
   */
  const repeatPromptsRef = useRef<RepeatPrompt[]>([]);
  const [repeatPrompts, setRepeatPromptsState] = useState<RepeatPrompt[]>([]);
  const declinedRepeatsRef = useRef(new Set<string>());
  const photoChecksRef = useRef(0);
  /** Sure matches between a Scan more line and a saved line, joined right after the save. */
  const pendingJoinsRef = useRef<[string, string][]>([]);
  /** A Scan more walk compared with the saved lines, saved with the inventory. */
  const walkCompareRef = useRef<WalkCompare | null>(null);
  /** Research counters for this scan. Never shown; read only by `apps/web/research/`. */
  const statsRef = useRef<ScanStats>(blankScanStats(crypto.randomUUID(), new Date().toISOString()));

  function bump(change: (stats: ScanStats) => void) {
    const next = structuredClone(statsRef.current);
    change(next);
    statsRef.current = next;
    const current = selectedRef.current;
    if (savedToInventoryRef.current && current) saveScanStats(current.id, next);
  }
  const repeatPrompt = repeatPrompts[0] ?? null;
  /** Object URLs of the two stills shown side by side, per prompt. Revoked when the prompt goes. */
  const thumbsRef = useRef(new Map<string, [string, string]>());

  function setRepeatPrompts(next: RepeatPrompt[]) {
    const kept = new Set(next.map((prompt) => prompt.id));
    for (const [id, urls] of thumbsRef.current) {
      if (kept.has(id)) continue;
      for (const url of urls) if (url) URL.revokeObjectURL(url);
      thumbsRef.current.delete(id);
    }
    repeatPromptsRef.current = next;
    setRepeatPromptsState(next);
  }
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [liveAsk, setLiveAsk] = useState<{ clip: number; request: EvidenceRequest } | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [snapNote, setSnapNote] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [clock, setClock] = useState<SessionClock>(blankClock());
  const [limitMs, setLimitMs] = useState(SCAN_LIMIT_MS);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ listed: number; total: number; lines: number; step: string }>({
    listed: 0,
    total: 0,
    lines: 0,
    step: "",
  });

  useEffect(() => {
    return () => {
      tapRef.current?.stop();
      captureRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const filming = phase === "starting" || phase === "recording" || phase === "paused";
    document.body.classList.toggle("is-filming", filming);
    return () => document.body.classList.remove("is-filming");
  }, [phase]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current || !selectedRef.current?.place) return;
    autoStartedRef.current = true;
    void beginScan();
    // Runs once on mount; beginScan reads refs for everything else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    let released = false;
    let sentinel: { release: () => Promise<void> } | null = null;
    const take = () => {
      const locks = navigator.wakeLock;
      if (!locks || released) return;
      void locks
        .request("screen")
        .then((lock) => {
          if (released) void lock.release();
          else sentinel = lock;
        })
        .catch(() => undefined);
    };
    take();
    const onVisible = () => {
      if (document.visibilityState === "visible") take();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const id = segmentIdRef.current;
      if (!video || !id) return;
      const at = Math.floor(clockRef.current.clipMs / 1000);
      const list = stillsRef.current.get(id) ?? [];
      if (list.some((frame) => frame.at === at) || list.length >= 30) return;
      void grabStill(video).then((blob) => {
        if (!blob) return;
        const current = stillsRef.current.get(id) ?? [];
        if (current.some((frame) => frame.at === at) || current.length >= 30) return;
        current.push({ at, blob });
        stillsRef.current.set(id, current);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording") return;
    lastTickRef.current = performance.now();
    const timer = window.setInterval(() => {
      if (modeRef.current !== "recording" || closingRef.current) return;
      const now = performance.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      const stepped = advanceClock(clockRef.current, delta, limitRef.current);
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

  useEffect(() => {
    if (phase === "paused") void askBelongs();
    // On each pause, once per room; askBelongs reads refs for the rest.
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

  function showProgress(step = "") {
    setProgress({ listed: appliedCountRef.current, total: partsRef.current.length, lines: lineCount(combinedRef.current), step });
  }

  function rememberReview(review: ReviewResult) {
    const remembered = review.rooms.flatMap((room) =>
      room.items.flatMap((item) => {
        const amount = item.priceUsd;
        if (amount == null || amount < 1 || item.pricedAt == null) return [];
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

  async function postPiece(piece: RecordedPiece, part: number): Promise<PieceOutcome> {
    const current = selectedRef.current;
    if (!current) return { ok: false, error: "This inventory is not open.", retry: false };
    const body = new FormData();
    const filename = (piece.blob.type || "").includes("mp4") ? `clip-${part}.mp4` : `clip-${part}.webm`;
    body.set("video", new File([piece.blob], filename, { type: piece.blob.type || "video/mp4" }));
    if (piece.audio) body.set("audio", new File([piece.audio], `clip-${part}.wav`, { type: "audio/wav" }));
    body.set("part", String(part));
    body.set("parts", "0");
    body.set("focus", JSON.stringify(focusNames()));
    body.set("known", JSON.stringify(knownSoFar(combinedRef.current)));
    if (piece.rooms.length > 0) body.set("rooms", JSON.stringify(piece.rooms));
    body.set("inventoryId", current.id);
    try {
      const response = await fetch("/api/scan/review", { method: "POST", body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = pieceErrorSchema.safeParse(payload);
        const message = failure.success ? failure.data.error : undefined;
        return {
          ok: false,
          error: message || "A clip did not review. Stay on this page and press retry.",
          retry: response.status >= 500 || response.status === 0 ? (failure.success ? failure.data.retry !== false : true) : false,
        };
      }
      const parsed = pieceResponseSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: "A clip did not come back as a list.", retry: true };
      return { ok: true, result: parsed.data };
    } catch {
      return { ok: false, error: "The connection dropped while a clip was reviewing.", retry: true };
    }
  }

  async function postPrices(lines: LineToPrice[]): Promise<PricedLine[]> {
    const current = selectedRef.current;
    if (!current || lines.length === 0) return [];
    try {
      const response = await fetch("/api/scan/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          kept: [...readKeptValues(), ...keptFromInventories(inventories)].slice(-40),
          address: current.homeAddress.slice(0, 300),
          region: addressRegionLabel(current.addressRegion).slice(0, 80),
          inventoryId: current.id,
        }),
      });
      if (!response.ok) return [];
      const parsed = priceResponseSchema.safeParse(await response.json().catch(() => null));
      return parsed.success ? parsed.data.priced : [];
    } catch {
      return [];
    }
  }

  async function priceAll(lines: LineToPrice[], idsByKey: Map<string, string[]>, descriptions: string[]) {
    for (let start = 0; start < lines.length; start += PRICE_BATCH) {
      const slice = lines.slice(start, start + PRICE_BATCH);
      // A timed-out batch is not "sent". One retry, and a second miss leaves the lines for the next pass.
      let priced = await postPrices(slice);
      if (priced.length === 0) priced = await postPrices(slice);
      if (priced.length === 0 || !combinedRef.current) continue;
      combinedRef.current = applyPrices(combinedRef.current, priced, idsByKey);
      for (const description of descriptions.slice(start, start + PRICE_BATCH)) pricingRef.current.sent.add(description);
    }
  }

  /** Price new lines while the next clips are still being listed. */
  function schedulePricing() {
    const pricing = pricingRef.current;
    if (pricing.running || !combinedRef.current) return;
    combinedRef.current = shareKnownPrices(combinedRef.current);
    const { lines, idsByKey, descriptions } = linesToPrice(combinedRef.current, pricing.sent);
    if (lines.length === 0) return;
    if (modeRef.current !== "done" && lines.length < 8) return;
    pricing.running = true;
    void priceAll(lines, idsByKey, descriptions).finally(() => {
      pricing.running = false;
      const more = combinedRef.current ? linesToPrice(combinedRef.current, pricing.sent).lines.length : 0;
      if (more > 0) schedulePricing();
      else maybeFinalize();
    });
  }

  async function postReconcile(review: ReviewResult) {
    const current = selectedRef.current;
    if (!current) return null;
    const order = new Map(partsRef.current.map((piece, index) => [piece.id, index + 1]));
    const lines = reconcileInput(review, (id) => order.get(id)).slice(0, 300);
    if (lines.length === 0) return null;
    const spoken = current.clips
      .flatMap((clip, index) => clip.spoken.map((line) => ({ at: `Clip ${index + 1} ${formatClock(line.startMs)}`, text: line.text.slice(0, 160) })))
      .slice(0, 80);
    try {
      const response = await fetch("/api/scan/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, spoken, inventoryId: current.id }),
      });
      if (!response.ok) return null;
      const parsed = reconcileResponseSchema.safeParse(await response.json().catch(() => null));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
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
    if (!current || savedToInventoryRef.current || !combinedRef.current) {
      if (partsRef.current.length === 0) {
        setPhase("paused");
        modeRef.current = "paused";
        setError("Record a clip before you finish.");
      }
      return;
    }
    savedToInventoryRef.current = true;
    const review = combinedRef.current;
    markProcessing(current.id, true);
    setScanReview(
      current.id,
      review,
      focusIds.length > 0 ? "focus" : hadClipsRef.current ? "append" : "replace",
      focusIds,
    );
    if (roomPromptsRef.current.length > 0) addRoomQuestions(current.id, roomPromptsRef.current);
    for (const [aId, bId] of pendingJoinsRef.current) joinLines(current.id, aId, bId);
    const crossJoined = pendingJoinsRef.current.length;
    pendingJoinsRef.current = [];
    statsRef.current = { ...statsRef.current, mergedAtDone: statsRef.current.mergedAtDone + crossJoined, endedAt: new Date().toISOString() };
    saveScanStats(current.id, statsRef.current);
    if (walkCompareRef.current) setWalkCompare(current.id, walkCompareRef.current);
    if (repeatPromptsRef.current.length > 0) {
      addRepeatQuestions(
        current.id,
        repeatPromptsRef.current.map(({ checking: _checking, cross: _cross, ...question }) => question),
      );
    }
    router.push("/");
    void (async () => {
      try {
        await stampChainRef.current;
        await stampStills(current.id, review);
        // Seal as soon as the pictures are on the lines. The label reads below are slow, and a phone
        // that locks during them used to leave the scan unsealed, as test 2b still is.
        setScanReview(current.id, review, "refresh");
        rememberReview(review);
        const sealedAt = new Date().toISOString();
        const recordHash = await sha256Hex(
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
        );
        sealRecord(current.id, recordHash, sealedAt);
        await identifyHighValue(current.id, review);
        setScanReview(current.id, review, "refresh");
      } finally {
        markProcessing(current.id, false);
      }
    })();
  }

  function keepTappedRooms<T extends { rooms: { from: string; to: string }[] }>(answer: T): T {
    const earlier = selectedRef.current?.clips.flatMap((clip) => (clip.rooms ?? []).map((marker) => marker.room)) ?? [];
    const now = partsRef.current.flatMap((part) => part.rooms.map((marker) => marker.room));
    return withoutTappedFolds(answer, [...earlier, ...now]);
  }

  /** After Done: every clip listed and priced, then one repeat check, then the last prices. */
  function maybeFinalize() {
    if (modeRef.current !== "done" || failedRef.current || finalizingRef.current || savedToInventoryRef.current) return;
    if (partsRef.current.length === 0 || appliedCountRef.current < partsRef.current.length) return;
    if (sendingRef.current.size > 0 || pricingRef.current.running) return;
    finalizingRef.current = true;
    void (async () => {
      try {
        if (combinedRef.current && focusIds.length === 0) {
          showProgress("Checking brands and repeats");
          const answer = await postReconcile(combinedRef.current);
          if (combinedRef.current) {
            let next = combinedRef.current;
            if (answer) next = applyReconcile(next, keepTappedRooms(answer)).review;
            // The same object in two rooms or under two names: strong identity merges, anything weaker is asked.
            const sure = repeatPairs(next.rooms).filter((pair) => pair.sure && !declinedRepeatsRef.current.has(pairKey(pair.aId, pair.bId)));
            if (sure.length > 0) {
              const merged = joinSurePairs(next, sure);
              next = merged.review;
              bump((stats) => void (stats.mergedAtDone += merged.joined));
            }
            combinedRef.current = next;
            queueRepeats(next, repeatPairs(next.rooms), false);
            // Scan more: the new walk against the lines already saved on this inventory.
            const saved = hadClipsRef.current ? (selectedRef.current?.rooms ?? []) : [];
            if (saved.length > 0) {
              const cross = crossPairs(saved, next.rooms).filter((pair) => !declinedRepeatsRef.current.has(pairKey(pair.aId, pair.bId)));
              pendingJoinsRef.current = [...pendingJoinsRef.current, ...cross.filter((pair) => pair.sure).map((pair): [string, string] => [pair.aId, pair.bId])];
              queueRepeats(
                { rooms: [...saved, ...next.rooms] },
                cross.filter((pair) => !pair.sure),
                true,
              );
              // Before and after: every saved line, against what this walk saw and which rooms it entered.
              const entered = [...partsRef.current.flatMap((part) => part.rooms.map((marker) => marker.room)), ...next.rooms.map((room) => room.title)];
              const earlier = (selectedRef.current?.clips ?? []).map((clip) => clip.startedAt).sort()[0] ?? null;
              walkCompareRef.current = compareWalks(saved, next.rooms, cross, entered, earlier);
            }
          }
        }
        if (combinedRef.current) {
          combinedRef.current = shareKnownPrices(combinedRef.current);
          const { lines, idsByKey, descriptions } = linesToPrice(combinedRef.current, pricingRef.current.sent);
          if (lines.length > 0) {
            showProgress("Checking local prices");
            await priceAll(lines, idsByKey, descriptions);
          }
        }
        // A line the web price lifted over $250 is read twice too. The answers land after the save.
        readTwiceNew();
      } finally {
        finishSession();
      }
    })();
  }

  function giveUp(message: string) {
    failedRef.current = true;
    setNeedsRetry(true);
    setError(message);
    if (modeRef.current === "done") setPhase("review-failed");
  }

  /** Fold finished clips into the session in clip order. */
  function nearestStill(frames: { at: number; blob: Blob }[], atSec: number) {
    let best: { at: number; blob: Blob } | null = null;
    let gap = 3;
    for (const frame of frames) {
      const next = Math.abs(frame.at - atSec);
      if (next < gap) {
        best = frame;
        gap = next;
      }
    }
    return best?.blob ?? null;
  }

  async function stampStills(inventoryId: string, review: ReviewResult) {
    const jobs: { item: ReviewResult["rooms"][number]["items"][number]; blob: Blob }[] = [];
    for (const room of review.rooms) {
      for (const item of room.items) {
        if (item.photoPath) continue;
        const sighting = item.sightings.find((entry) => entry.clipId && entry.atSec != null);
        if (!sighting?.clipId || sighting.atSec == null) continue;
        const blob = nearestStill(stillsRef.current.get(sighting.clipId) ?? [], sighting.atSec);
        if (blob) jobs.push({ item, blob });
      }
    }
    for (let index = 0; index < jobs.length; index += 4) {
      await Promise.all(
        jobs.slice(index, index + 4).map(async ({ item, blob }) => {
          const stored = `${item.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}.jpg`;
          const path = await saveMedia(inventoryId, stored, blob);
          if (!path) return;
          item.photoPath = path;
          item.photoUrl = URL.createObjectURL(blob);
        }),
      );
    }
    stillsRef.current.clear();
  }

  /**
   * Stills are saved while filming, clip by clip, so a line has its picture before Done. The last clip's
   * stills are saved at Done by `stampStills`. A line merged since keeps the picture under its own id.
   */
  const stampChainRef = useRef<Promise<void>>(Promise.resolve());
  function stampClip(clipId: string) {
    const current = selectedRef.current;
    const review = combinedRef.current;
    if (!current || !review) return;
    const frames = stillsRef.current.get(clipId) ?? [];
    if (frames.length === 0) return;
    const jobs: { id: string; blob: Blob }[] = [];
    for (const item of review.rooms.flatMap((room) => room.items)) {
      if (item.photoPath) continue;
      const sighting = item.sightings.find((entry) => entry.clipId === clipId && entry.atSec != null);
      if (!sighting || sighting.atSec == null) continue;
      const blob = nearestStill(frames, sighting.atSec);
      if (blob) jobs.push({ id: item.id, blob });
    }
    if (jobs.length === 0) return;
    const inventoryId = current.id;
    stampChainRef.current = stampChainRef.current.then(async () => {
      for (let index = 0; index < jobs.length; index += 4) {
        await Promise.all(
          jobs.slice(index, index + 4).map(async ({ id, blob }) => {
            const path = await saveMedia(inventoryId, `${id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}.jpg`, blob);
            if (!path) return;
            const now = combinedRef.current;
            const line = now?.rooms.flatMap((room) => room.items).find((entry) => entry.id === id);
            if (line && !line.photoPath) {
              line.photoPath = path;
              line.photoUrl = URL.createObjectURL(blob);
            }
          }),
        );
      }
    });
  }

  async function identifyHighValue(inventoryId: string, review: ReviewResult) {
    const current = selectedRef.current;
    if (!current) return;
    const targets = review.rooms
      .flatMap((room) => room.items)
      .filter((item) => !item.markings && (item.priceUsd ?? 0) > 250 && item.photoUrl?.startsWith("blob:"))
      .slice(0, 6);
    for (const item of targets) {
      try {
        const blob = await fetch(item.photoUrl ?? "").then((response) => response.blob());
        const result = await sendEvidence({
          kind: "label",
          item,
          image: blob,
          answer: "",
          address: current.homeAddress,
          region: addressRegionLabel(current.addressRegion),
          inventoryId,
        });
        if ("error" in result) continue;
        if (result.patch.brand) item.brand = result.patch.brand;
        if (result.patch.markings) item.markings = result.patch.markings;
        if (result.patch.serial) item.serial = result.patch.serial ?? item.serial;
        if (item.brand && item.markings) item.identitySettled = modelRecognized(item.brand, item.markings);
      } catch {
        // One item failing does not stop the file.
      }
    }
  }

  function applyReady() {
    applyChainRef.current = applyChainRef.current.then(async () => {
      for (const index of readyInOrder(appliedCountRef.current, resultsRef.current)) {
        const result = resultsRef.current.get(index);
        const piece = partsRef.current[index];
        if (!result || !piece) break;
        const review = tagReview(result.review, piece.id);
        bump((stats) => {
          stats.clips += 1;
          stats.listedLines += lineCount(review);
        });
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
          ...(piece.rooms.length > 0 ? { rooms: piece.rooms } : {}),
        });
        const inventoryId = selectedRef.current?.id;
        if (inventoryId) void keepMedia(inventoryId, piece.id, piece);
        combinedRef.current = combinedRef.current ? combinePieceReviews(combinedRef.current, review) : review;
        offerRoomChange(result.roomHint ?? null, piece, index + 1);
        liveRepeats();
        stampClip(piece.id);
        readTwiceNew();
        resultsRef.current.delete(index);
        appliedCountRef.current = index + 1;
        nextAsk(combinedRef.current, index + 1);
      }
      showProgress();
      schedulePricing();
      maybeFinalize();
    });
  }

  async function sendPiece(index: number) {
    const piece = partsRef.current[index];
    if (!piece) return;
    sendingRef.current.add(index);
    try {
      if (piece.blob.size > 32 * 1024 * 1024) {
        giveUp("A clip is still too large to review. Pause and record a shorter pass.");
        return;
      }
      for (let tries = 1; tries <= CLIP_TRIES; tries += 1) {
        const outcome = await postPiece(piece, index + 1);
        if (outcome.ok) {
          resultsRef.current.set(index, outcome.result);
          applyReady();
          return;
        }
        if (!outcome.retry || tries === CLIP_TRIES) {
          giveUp(outcome.error);
          return;
        }
        await sleep(retryDelayMs(tries));
      }
    } finally {
      sendingRef.current.delete(index);
      if (!failedRef.current) pump();
    }
  }

  function pump() {
    if (failedRef.current) return;
    const done = new Set<number>(resultsRef.current.keys());
    for (let index = 0; index < appliedCountRef.current; index += 1) done.add(index);
    for (const index of clipsToSend(partsRef.current.length, done, sendingRef.current)) void sendPiece(index);
    showProgress();
    maybeFinalize();
  }

  function startRecorder() {
    const stream = recordStreamRef.current;
    if (!stream) return;
    const segmentId = crypto.randomUUID();
    segmentIdRef.current = segmentId;
    stillsRef.current.set(segmentId, []);
    const recorder = makeRecorder(stream);
    chunksRef.current = [];
    segmentStartedAtRef.current = new Date().toISOString();
    piecePosterRef.current = "";
    markersRef.current = roomRef.current ? [{ atMs: 0, room: roomRef.current }] : [];
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
      const rooms = markersRef.current.slice(0, 20);
      if (blob.size > 1000) {
        partsRef.current.push({
          id: segmentId,
          blob,
          audio,
          startedAt: segmentStartedAtRef.current,
          durationMs: Math.max(0, clockRef.current.clipMs),
          posterUrl: piecePosterRef.current,
          rooms,
        });
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
        pump();
        return;
      }
      if (reason === "pause") {
        modeRef.current = "paused";
        pausedAtRef.current = Date.now();
        setPhase("paused");
        pump();
        return;
      }
      modeRef.current = "done";
      stopCamera();
      setPhase(partsRef.current.length > 0 ? "reviewing" : "paused");
      if (partsRef.current.length === 0) setError("Record a clip before you finish.");
      pump();
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
      pump();
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
    const audio = { echoCancellation: true, noiseSuppression: true };
    const attempts: { constraints: MediaStreamConstraints; facing: Facing }[] = [
      { constraints: { video: videoConstraints("environment"), audio }, facing: "environment" },
      { constraints: { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio }, facing: "user" },
      { constraints: { video: true, audio: true }, facing: "environment" },
    ];
    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
        facingRef.current = attempt.facing;
        setFacing(attempt.facing);
        return stream;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  /** Read what this lens can do. Zoom controls only show when the camera itself zooms. */
  function readLens(stream: MediaStream) {
    const track = stream.getVideoTracks()[0];
    const range = zoomRangeOf(track);
    setZoomRange(range);
    setZoom(range ? currentZoom(track, range) : 1);
  }

  /**
   * Swap front and back lens. The audio track stays, so narration continues. While a clip is
   * recording the encoder reads the preview canvas, so the swap lands in the recording too; when the
   * browser records the camera directly the swap waits for a pause.
   */
  async function flipCamera() {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video || flipping) return;
    if (modeRef.current === "recording" && !captureRef.current) return;
    const next: Facing = facingRef.current === "environment" ? "user" : "environment";
    setFlipping(true);
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(next), audio: false });
      const lens = fresh.getVideoTracks()[0];
      if (!lens) throw new Error("lens");
      for (const track of stream.getVideoTracks()) {
        stream.removeTrack(track);
        track.stop();
      }
      stream.addTrack(lens);
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay can lag; the frames still land.
      }
      facingRef.current = next;
      setFacing(next);
      readLens(stream);
    } catch {
      // The other lens is missing or blocked. Keep filming with this one.
    } finally {
      setFlipping(false);
    }
  }

  /**
   * Queue a room-change question. It is asked on the camera, then on the finishing screen after Done.
   * One still waiting when the scan is saved goes onto the inventory and is asked there.
   */
  function offerRoomChange(hint: RoomHint | null, piece: RecordedPiece, clip: number) {
    if (!hint) return;
    const tapped = roomAt(piece.rooms, hint.atSec);
    if (!tapped || declinedRoomsRef.current.has(hint.room.toLowerCase())) return;
    if (roomPromptsRef.current.some((prompt) => prompt.clipId === piece.id)) return;
    const question: RoomPrompt = { id: crypto.randomUUID(), clipId: piece.id, clip, atSec: hint.atSec, room: hint.room, tapped };
    const current = selectedRef.current;
    if (savedToInventoryRef.current) {
      if (current) addRoomQuestions(current.id, [question]);
      return;
    }
    setRoomPrompts([...roomPromptsRef.current, question]);
    bump((stats) => void (stats.roomPrompts.asked += 1));
  }

  function noteRoom(text: string) {
    setRoomNoteText(text);
    if (roomNoteTimerRef.current) window.clearTimeout(roomNoteTimerRef.current);
    roomNoteTimerRef.current = window.setTimeout(() => setRoomNoteText(""), 5000);
  }

  /** Yes to the prompt: that clip's lines from that second move, and filming goes on in that room. */
  function acceptRoomChange() {
    const prompt = roomPromptsRef.current[0];
    if (!prompt) return;
    setRoomPrompts(roomPromptsRef.current.slice(1));
    bump((stats) => void (stats.roomPrompts.accepted += 1));
    const current = selectedRef.current;
    let moved = 0;
    if (savedToInventoryRef.current) {
      if (current) moved = answerRoomQuestion(current.id, prompt.id, true);
    } else if (combinedRef.current) {
      const result = moveClipLines(combinedRef.current, prompt.clipId, prompt.atSec, prompt.tapped, prompt.room);
      combinedRef.current = result.review;
      moved = result.moved;
      const piece = partsRef.current.find((part) => part.id === prompt.clipId);
      if (piece) {
        piece.rooms = withMarker(piece.rooms, Math.round(prompt.atSec * 1000), prompt.room);
        if (current) updateClip(current.id, piece.id, { rooms: piece.rooms });
      }
      showProgress();
    }
    noteRoom(
      moved > 0
        ? `Moved ${moved} ${moved === 1 ? "line" : "lines"} from clip ${prompt.clip} to ${prompt.room}.`
        : `Nothing moved. Those lines were also seen in another clip, so they stay in ${prompt.tapped}.`,
    );
    if (roomRef.current === prompt.tapped && modeRef.current !== "done") chooseRoom(prompt.room);
  }

  function declineRoomChange() {
    const prompt = roomPromptsRef.current[0];
    if (!prompt) return;
    declinedRoomsRef.current.add(prompt.room.toLowerCase());
    setRoomPrompts(roomPromptsRef.current.slice(1));
    bump((stats) => void (stats.roomPrompts.declined += 1));
    const current = selectedRef.current;
    if (savedToInventoryRef.current && current) answerRoomQuestion(current.id, prompt.id, false);
  }

  /**
   * After each clip: the same object listed twice in this walk, in any room. A sure match is merged at
   * once; a weaker one is asked, with Muse Spark 1.3 comparing the two stills first.
   */
  function liveRepeats() {
    const current = combinedRef.current;
    if (!current || focusIds.length > 0) return;
    const fresh = (pair: { aId: string; bId: string }) => !declinedRepeatsRef.current.has(pairKey(pair.aId, pair.bId));
    const sure = repeatPairs(current.rooms).filter((pair) => pair.sure && fresh(pair));
    let next = current;
    if (sure.length > 0) {
      const merged = joinSurePairs(next, sure);
      next = merged.review;
      if (merged.joined > 0) bump((stats) => void (stats.mergedLive += merged.joined));
      if (merged.joined > 0) noteRoom(`Merged ${merged.joined} repeat ${merged.joined === 1 ? "line" : "lines"}: the same object was listed twice.`);
    }
    combinedRef.current = next;
    queueRepeats(next, repeatPairs(next.rooms), false);
  }

  /** Add weaker pairs to the waiting list, drop ones whose lines are gone, and start their photo checks. */
  function queueRepeats(review: ReviewResult, pairs: { aId: string; bId: string; sure: boolean; reason: string }[], cross: boolean) {
    const ids = new Set(review.rooms.flatMap((entry) => entry.items.map((line) => line.id)));
    const sessionIds = new Set((combinedRef.current?.rooms ?? []).flatMap((entry) => entry.items.map((line) => line.id)));
    const savedIds = new Set((selectedRef.current?.rooms ?? []).flatMap((entry) => entry.items.map((line) => line.id)));
    const alive = (prompt: RepeatPrompt) =>
      prompt.cross
        ? savedIds.has(prompt.aId) && sessionIds.has(prompt.bId)
        : sessionIds.has(prompt.aId) && sessionIds.has(prompt.bId);
    const waiting = repeatPromptsRef.current.filter(alive);
    const known = new Set(waiting.map((prompt) => pairKey(prompt.aId, prompt.bId)));
    const added = repeatQuestions(
      review.rooms,
      pairs.filter((pair) => {
        const key = pairKey(pair.aId, pair.bId);
        // A sure pair still here was refused by the join rules (two categories, for one), so it is asked.
        return ids.has(pair.aId) && ids.has(pair.bId) && !known.has(key) && !declinedRepeatsRef.current.has(key);
      }),
    ).map((question): RepeatPrompt => ({ ...question, checking: false, cross }));
    setRepeatPrompts([...waiting, ...added].slice(0, 20));
    if (added.length > 0) bump((stats) => void (stats.repeatsAsked += added.length));
    for (const prompt of added) void checkRepeat(prompt);
  }

  function findLine(id: string) {
    const lines = [...(combinedRef.current?.rooms ?? []), ...(selectedRef.current?.rooms ?? [])].flatMap((entry) => entry.items);
    return lines.find((line) => line.id === id) ?? null;
  }

  /** The still kept from this scan at the second the line was clearest, or the line's saved photo. */
  async function stillOf(id: string) {
    const line = findLine(id);
    if (!line) return null;
    for (const sighting of line.sightings) {
      const frames = sighting.clipId ? stillsRef.current.get(sighting.clipId) : undefined;
      const blob = frames?.length ? nearestStill(frames, sighting.atSec ?? 0) : null;
      if (blob) return blob;
    }
    return photoBlob(line.photoUrl);
  }

  async function checkRepeat(prompt: RepeatPrompt) {
    const current = selectedRef.current;
    if (!current || photoChecksRef.current >= PHOTO_CHECKS_PER_SCAN) return;
    const [a, b] = await Promise.all([stillOf(prompt.aId), stillOf(prompt.bId)]);
    if (!a || !b) return;
    photoChecksRef.current += 1;
    thumbsRef.current.set(prompt.id, [URL.createObjectURL(a), URL.createObjectURL(b)]);
    const mark = (patch: Partial<RepeatPrompt>) =>
      setRepeatPrompts(repeatPromptsRef.current.map((entry) => (entry.id === prompt.id ? { ...entry, ...patch } : entry)));
    mark({ checking: true });
    const lineA = findLine(prompt.aId);
    const lineB = findLine(prompt.bId);
    const check = await askSameObject(
      current.id,
      { name: prompt.aName, room: prompt.aRoom, detail: lineA?.detail ?? "", image: a },
      { name: prompt.bName, room: prompt.bRoom, detail: lineB?.detail ?? "", image: b },
    );
    if (repeatPromptsRef.current.some((entry) => entry.id === prompt.id)) {
      mark({ checking: false, check });
    }
    if (check) bump((stats) => void (stats.photoChecks[check.verdict] += 1));
    if (check && savedToInventoryRef.current) setRepeatCheck(current.id, prompt.id, check);
  }

  /** Lines asked to be read twice in this scan, so none is read again. */
  const readRequestedRef = useRef(new Set<string>());

  /** Rooms already asked "what usually belongs here", and things the person said are not here. */
  const belongsAskedRef = useRef(new Set<string>());
  const notHereRef = useRef(new Set<string>());
  const [belongs, setBelongs] = useState<(BelongsQuestion & { room: string })[]>([]);

  /**
   * On a pause, once per room: Muse Spark 1.3 gets the room name and what is listed in it, and returns up
   * to three things a room like that usually has that were not filmed. They are questions. Nothing on
   * screen says the list is complete.
   */
  async function askBelongs() {
    const current = selectedRef.current;
    const review = combinedRef.current;
    if (!current || !review || focusIds.length > 0) return;
    const roomTitle = roomRef.current ?? review.rooms[review.rooms.length - 1]?.title ?? "";
    if (!roomTitle || roomTitle === ROOM_NOT_SET || belongsAskedRef.current.has(roomTitle.toLowerCase())) return;
    const lines = review.rooms
      .filter((entry) => entry.title.toLowerCase() === roomTitle.toLowerCase())
      .flatMap((entry) => entry.items.map((line) => line.name));
    if (lines.length === 0) return;
    belongsAskedRef.current.add(roomTitle.toLowerCase());
    try {
      const response = await fetch("/api/scan/belongs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomTitle.slice(0, 80), lines: lines.slice(0, 80).map((name) => name.slice(0, 120)), inventoryId: current.id }),
      });
      const parsed = belongsResponseSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) return;
      const fresh = withoutNotHere(parsed.data.questions, roomTitle, notHereRef.current).map((question) => ({ ...question, room: roomTitle }));
      if (fresh.length > 0) {
        setBelongs((waiting) => [...waiting, ...fresh].slice(0, 6));
        bump((stats) => void (stats.belongs.asked += fresh.length));
      }
    } catch {
      // A reminder that did not come back is not shown. Filming is not affected.
    }
  }

  function answerBelongs(notHere: boolean) {
    if (notHere) bump((stats) => void (stats.belongs.notHere += 1));
    setBelongs((waiting) => {
      const first = waiting[0];
      if (first && notHere) notHereRef.current.add(notHereKey(first.room, first.thing));
      return waiting.slice(1);
    });
  }

  /** Two different stills of one line: its clearest second, and another sighting or a second or two away. */
  function twoStills(id: string): [Blob, Blob] | null {
    const line = findLine(id);
    if (!line) return null;
    const views: { clipId: string; atSec: number }[] = line.sightings.flatMap((sighting) =>
      sighting.clipId ? [{ clipId: sighting.clipId, atSec: sighting.atSec ?? 0 }] : [],
    );
    const first = views[0];
    if (!first) return null;
    const framesA = stillsRef.current.get(first.clipId) ?? [];
    const a = nearestStill(framesA, first.atSec);
    if (!a) return null;
    const other = views.slice(1).find((view) => view.clipId !== first.clipId) ?? null;
    if (other) {
      const b = nearestStill(stillsRef.current.get(other.clipId) ?? [], other.atSec);
      if (b && b !== a) return [a, b];
    }
    for (const offset of [2, -2, 3, -3, 1, -1]) {
      const b = nearestStill(framesA, first.atSec + offset);
      if (b && b !== a) return [a, b];
    }
    return null;
  }

  /**
   * Read twice: every line that could be over $250 is identified twice by Muse Spark 1.3, from two stills,
   * independently. Matching answers confirm it; answers that disagree mark it unsure, and both are kept.
   */
  function readTwiceNew() {
    const current = selectedRef.current;
    const review = combinedRef.current;
    if (!current || !review) return;
    for (const line of review.rooms.flatMap((room) => room.items)) {
      if (readRequestedRef.current.size >= READ_TWICE_PER_SCAN) return;
      if (readRequestedRef.current.has(line.id) || !needsReadTwice(line)) continue;
      const stills = twoStills(line.id);
      if (!stills) continue;
      readRequestedRef.current.add(line.id);
      const inventoryId = current.id;
      void askReadTwice(inventoryId, {
        a: stills[0],
        b: stills[1],
        category: line.category ?? "",
        said: line.said[0]?.text ?? line.narration ?? "",
        description: line.detail,
      }).then((reads) => {
        if (!reads) return;
        const check: IdentityCheck = { result: compareReads(reads[0], reads[1]), reads, at: new Date().toISOString(), resolved: null };
        if (savedToInventoryRef.current) {
          setIdentityCheck(inventoryId, line.id, check);
          return;
        }
        const now = combinedRef.current;
        if (!now) return;
        combinedRef.current = {
          rooms: now.rooms.map((room) => ({
            ...room,
            items: room.items.map((item) => (item.id === line.id ? withIdentityCheck(item, check) : item)),
          })),
        };
        if (check.result === "unsure") noteRoom(`${line.name}: two reads disagree. It stays unsure until you pick.`);
      });
    }
  }

  function acceptRepeat() {
    const prompt = repeatPromptsRef.current[0];
    if (!prompt) return;
    setRepeatPrompts(repeatPromptsRef.current.slice(1));
    const current = selectedRef.current;
    if (savedToInventoryRef.current) {
      if (current) answerRepeatQuestion(current.id, prompt.id, true);
    } else if (prompt.cross) {
      pendingJoinsRef.current = [...pendingJoinsRef.current, [prompt.aId, prompt.bId]];
    } else if (combinedRef.current) {
      combinedRef.current = joinRepeatPair(combinedRef.current, prompt.aId, prompt.bId).review;
      showProgress();
    }
    noteRoom(`Merged into one line${prompt.aRoom === prompt.bRoom ? "" : `, seen in ${prompt.aRoom} and ${prompt.bRoom}`}.`);
    bump((stats) => void (stats.repeatsMergedByOwner += 1));
  }

  function declineRepeat() {
    const prompt = repeatPromptsRef.current[0];
    if (!prompt) return;
    declinedRepeatsRef.current.add(pairKey(prompt.aId, prompt.bId));
    setRepeatPrompts(repeatPromptsRef.current.slice(1));
    bump((stats) => void (stats.repeatsKept += 1));
    const current = selectedRef.current;
    if (savedToInventoryRef.current && current) answerRepeatQuestion(current.id, prompt.id, false);
  }

  /** The room from this second of the clip on. While paused, the next clip starts in it. */
  function chooseRoom(title: string) {
    const next = title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!next) return;
    roomRef.current = next;
    setRoom(next);
    setMoreOpen(false);
    setNewRoom("");
    declinedRoomsRef.current.clear();
    if (modeRef.current !== "recording" || closingRef.current) return;
    const atMs = Math.max(0, Math.round(clockRef.current.clipMs));
    const kept = markersRef.current.filter((marker) => marker.atMs < atMs);
    if (kept[kept.length - 1]?.room === next) return;
    markersRef.current = [...kept, { atMs, room: next }].slice(-20);
  }

  function changeZoom(direction: 1 | -1) {
    const range = zoomRange;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!range || !track) return;
    const next = Math.min(range.max, Math.max(range.min, Number((zoom + direction * range.step).toFixed(2))));
    if (next === zoom) return;
    setZoom(next);
    const constraints = { advanced: [{ zoom: next }] } as unknown as MediaTrackConstraints;
    track.applyConstraints(constraints).catch(() => setZoom(currentZoom(track, range)));
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
      readLens(stream);
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
      roomRef.current = null;
      markersRef.current = [];
      declinedRoomsRef.current.clear();
      declinedRepeatsRef.current.clear();
      pendingJoinsRef.current = [];
      walkCompareRef.current = null;
      statsRef.current = blankScanStats(crypto.randomUUID(), new Date().toISOString());
      photoChecksRef.current = 0;
      readRequestedRef.current.clear();
      belongsAskedRef.current.clear();
      notHereRef.current.clear();
      setBelongs([]);
      setRepeatPrompts([]);
      setRoom(null);
      setMoreOpen(false);
      setRoomPrompts([]);
      setRoomNoteText("");
      setLiveAsk(null);
      setSnapNote("");
      partsRef.current = [];
      appliedCountRef.current = 0;
      resultsRef.current = new Map();
      sendingRef.current = new Set();
      failedRef.current = false;
      pricingRef.current = { running: false, sent: new Set() };
      finalizingRef.current = false;
      savedToInventoryRef.current = false;
      hashesRef.current = [];
      combinedRef.current = null;
      hadClipsRef.current = current.clips.length > 0;
      limitRef.current = hadClipsRef.current ? ADD_LIMIT_MS : SCAN_LIMIT_MS;
      setLimitMs(limitRef.current);
      clockRef.current = blankClock();
      setClock(clockRef.current);
      showProgress();
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
    failedRef.current = false;
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
        : "That did not settle it. The estimate stands; you can add a photo from the list later.",
    );
    nextAsk(combinedRef.current, ask.clip);
  }

  const live = phase === "starting" || phase === "recording" || phase === "paused";
  const slots = Math.round(limitMs / CLIP_MS);
  const clipNumber = Math.min(slots, clock.clips + (phase === "recording" ? 1 : 0));
  const remainingMs = Math.max(0, limitMs - clock.recordedMs);
  const reviewing = progress.total > progress.listed;
  const canFlip = !flipping && (phase === "paused" || (phase === "recording" && captureRef.current !== null));
  const hasClips = partsRef.current.length > 0;

  if (!selected) return null;

  function roomPromptCard(className: string) {
    if (!roomPrompt) return null;
    const switching = modeRef.current !== "done" && room !== roomPrompt.room && roomRef.current === roomPrompt.tapped;
    return (
      <div className={className} role="status" aria-live="polite">
        <p>
          Clip {roomPrompt.clip} looks like {roomPrompt.room} from {formatClock(roomPrompt.atSec * 1000)}, but {roomPrompt.tapped} was tapped.
          {roomPrompts.length > 1 ? ` ${roomPrompts.length - 1} more after this.` : ""}
        </p>
        <div className="film-room-hint-actions">
          <button type="button" className="film-room is-add" onClick={acceptRoomChange}>
            {switching ? `Switch to ${roomPrompt.room}` : `Move those lines to ${roomPrompt.room}`}
          </button>
          <button type="button" className="film-room" onClick={declineRoomChange}>
            Keep {roomPrompt.tapped}
          </button>
        </div>
      </div>
    );
  }

  function repeatPromptCard(className: string) {
    if (!repeatPrompt || roomPrompt) return null;
    const thumbs = thumbsRef.current.get(repeatPrompt.id);
    const verdict = verdictText(repeatPrompt.check, repeatPrompt.checking);
    return (
      <div className={className} role="status" aria-live="polite">
        <p>
          Possible repeat: {repeatPrompt.aName} in {repeatPrompt.aRoom} and {repeatPrompt.bName} in {repeatPrompt.bRoom}. {repeatPrompt.reason}
          {repeatPrompts.length > 1 ? ` ${repeatPrompts.length - 1} more after this.` : ""}
        </p>
        {thumbs ? (
          <div className="repeat-pair">
            {thumbs.map((url, index) => (
              <div className="repeat-side" key={url}>
                {/* Stills from this scan, still on this device. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" />
                <strong>{index === 0 ? repeatPrompt.aName : repeatPrompt.bName}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {verdict ? <p className="repeat-verdict">{verdict}</p> : null}
        <div className="film-room-hint-actions">
          <button type="button" className="film-room is-add" onClick={acceptRepeat}>
            Same item
          </button>
          <button type="button" className="film-room" onClick={declineRepeat}>
            Two items
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="recorder">
      {phase === "idle" ? (
        <div className="sheet scan-setup">
          <button type="button" className="back-arrow" onClick={onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12 H6 M11 6 L5 12 L11 18" />
            </svg>
            <span className="sr-only">Back</span>
          </button>
          <p className="confirm-title">{selected.title.trim()}</p>
          {selected.clips.length > 0 ? (
            <p className="hint">This adds up to 5 more minutes to the inventory. A repeat of something already listed is matched to its line.</p>
          ) : null}
        </div>
      ) : null}
      {live ? (
        <div className={`preview is-stage${facing === "user" ? " is-mirrored" : ""}`}>
          <video ref={videoRef} muted autoPlay playsInline disablePictureInPicture />
          {phase === "starting" ? (
            <div className="preview-idle">
              <Loader size={72} layout="inline" />
              <p className="film-note">Opening the camera</p>
            </div>
          ) : null}
          <ScanGlance videoRef={videoRef} active={phase === "recording"} inventoryId={selected.id} lines={progress.lines} />
          {phase === "recording" || phase === "paused" ? (
            <>
              <div className="film-top">
                <p className="film-status" aria-live="polite">
                  {phase === "recording" ? <span className="rec-dot" aria-hidden="true" /> : null}
                  <span>{phase === "recording" ? `Clip ${clipNumber} · ${formatClock(clock.clipMs)}` : "Paused"}</span>
                </p>
                <p className="film-remaining">
                  <strong>{formatClock(remainingMs)}</strong>
                  <span>left</span>
                </p>
                <button
                  type="button"
                  className="film-icon"
                  onClick={() => void flipCamera()}
                  disabled={!canFlip}
                  aria-label={facing === "environment" ? "Switch to front camera" : "Switch to back camera"}
                  title={canFlip ? undefined : "Pause to switch cameras"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7.5h3l1.6-2h6.8l1.6 2h3v11H4z" />
                    <path d="M9.2 13.2a3 3 0 0 0 5.4 1.2M14.8 12.8a3 3 0 0 0-5.4-1.2" />
                    <path d="M14.6 10.6v2.2h-2.2M9.4 15.4v-2.2h2.2" />
                  </svg>
                </button>
              </div>
              <div className="film-rooms">
                <div className="film-room-row" role="group" aria-label="Room you are in">
                  <div className="film-room-scroll">
                    {DEMO_ROOMS.map((title) => (
                      <button
                        key={title}
                        type="button"
                        className={room === title ? "film-room is-on" : "film-room"}
                        aria-pressed={room === title}
                        onClick={() => chooseRoom(title)}
                      >
                        {title}
                      </button>
                    ))}
                    {room && !(DEMO_ROOMS as readonly string[]).includes(room) ? (
                      <button type="button" className="film-room is-on" aria-pressed="true" onClick={() => setMoreOpen((open) => !open)}>
                        {room}
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={moreOpen ? "film-room is-more is-open" : "film-room is-more"}
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen((open) => !open)}
                  >
                    More
                  </button>
                </div>
                {moreOpen ? (
                  <div className="film-room-more">
                    <div className="film-room-grid">
                      {MORE_ROOMS.map((title) => (
                        <button
                          key={title}
                          type="button"
                          className={room === title ? "film-room is-on" : "film-room"}
                          aria-pressed={room === title}
                          onClick={() => chooseRoom(title)}
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                    <form
                      className="film-room-add"
                      onSubmit={(event) => {
                        event.preventDefault();
                        chooseRoom(newRoom);
                      }}
                    >
                      <input
                        className="film-room-input"
                        value={newRoom}
                        maxLength={80}
                        placeholder="Add a room"
                        aria-label="Add a room"
                        enterKeyHint="done"
                        onChange={(event) => setNewRoom(event.target.value)}
                      />
                      <button type="submit" className="film-room is-add" disabled={!newRoom.trim()}>
                        Add
                      </button>
                    </form>
                  </div>
                ) : null}
                {roomPromptCard("film-room-hint")}
                {phase === "paused" ? repeatPromptCard("film-room-hint") : null}
                {phase === "paused" && !roomPrompt && !repeatPrompt && belongs[0] ? (
                  <div className="film-room-hint" role="status" aria-live="polite">
                    <p>
                      {belongs[0].question}
                      {belongs[0].reason ? ` ${belongs[0].reason}` : ""}
                    </p>
                    <p className="repeat-verdict">A reminder from Muse Spark 1.3 for {belongs[0].room}. Film it, say it, or skip it.</p>
                    <div className="film-room-hint-actions">
                      <button type="button" className="film-room is-add" onClick={() => answerBelongs(false)}>
                        I will film it
                      </button>
                      <button type="button" className="film-room" onClick={() => answerBelongs(true)}>
                        Not here
                      </button>
                    </div>
                  </div>
                ) : null}
                {!roomPrompt && roomNoteText ? <p className="film-room-nudge">{roomNoteText}</p> : null}
                {!roomPrompt && !roomNoteText && room == null && !moreOpen ? <p className="film-room-nudge">Tap the room you are in</p> : null}
                {phase === "recording" && !roomPrompt && repeatPrompts.length > 0 ? (
                  <p className="film-room-nudge">
                    {repeatPrompts.length} possible {repeatPrompts.length === 1 ? "repeat" : "repeats"}. Pause to check.
                  </p>
                ) : null}
              </div>
              {zoomRange ? (
                <div className="film-zoom" role="group" aria-label="Zoom">
                  <button type="button" className="film-icon" onClick={() => changeZoom(1)} disabled={zoom >= zoomRange.max} aria-label="Zoom in">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 6v12M6 12h12" />
                    </svg>
                  </button>
                  <span className="film-zoom-value">{zoom.toFixed(1)}×</span>
                  <button type="button" className="film-icon" onClick={() => changeZoom(-1)} disabled={zoom <= zoomRange.min} aria-label="Zoom out">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 12h12" />
                    </svg>
                  </button>
                </div>
              ) : null}
              <div className="film-bar">
                {phase === "paused" && liveAsk ? (
                  <div className="ask-live film-ask" role="status" aria-live="polite">
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
                {phase === "paused" && snapNote ? <p className="film-note">{snapNote}</p> : null}
                <div className="clip-rail" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${slots}, 1fr)` }}>
                  {Array.from({ length: slots }, (_, index) => {
                    const start = index * CLIP_MS;
                    const amount = Math.min(1, Math.max(0, (clock.recordedMs - start) / CLIP_MS));
                    return (
                      <span className="clip-mark" key={index}>
                        <span style={{ transform: `scaleX(${amount})` }} />
                      </span>
                    );
                  })}
                </div>
                <div className="film-controls">
                  <p className="film-note film-controls-note">
                    {phase === "recording"
                      ? "Pause any time. Only what you film is listed."
                      : reviewing
                        ? `Listed ${progress.listed} of ${progress.total} clips.`
                        : hasClips
                          ? "Play to keep going, or Done to finish."
                          : "Press record to start the first clip."}
                  </p>
                  {phase === "recording" ? (
                    <button type="button" className="film-shutter is-recording" onClick={() => closeClip("pause")} aria-label="Pause recording">
                      <span aria-hidden="true" />
                    </button>
                  ) : (
                    <button type="button" className="film-shutter" onClick={resumeScan} aria-label={hasClips ? "Resume recording" : "Start recording"}>
                      <span aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" className="button film-done" onClick={() => closeClip("finish")} disabled={!hasClips && phase !== "recording"}>
                    Done
                  </button>
                </div>
                {error ? (
                  <p className="film-note" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {phase === "reviewing" ? (
        <div className="sheet scan-finishing" role="status" aria-live="polite">
          <Loader size={56} layout="inline" />
          <div>
            <p className="scan-finishing-title">
              {progress.step || (reviewing ? `Listing clip ${Math.min(progress.total, progress.listed + 1)} of ${progress.total}` : "Pricing the last lines")}
            </p>
            <div className="scan-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${progress.total ? progress.listed / progress.total : 0})` }} />
            </div>
            <p className="hint">
              {progress.lines > 0 ? `${progress.lines} lines so far. ` : ""}Keep this page open. Clips are reviewed two at a time and retried on their own.
            </p>
          </div>
        </div>
      ) : null}
      {phase === "reviewing" ? roomPromptCard("sheet room-question") : null}
      {phase === "reviewing" ? repeatPromptCard("sheet room-question") : null}
      {phase === "reviewing" && !roomPrompt && roomNoteText ? <p className="hint">{roomNoteText}</p> : null}
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
            onSaveMedia={saveMedia}
            onResolveIdentity={(itemId, pick) => resolveIdentityCheck(selected.id, itemId, pick)}
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
      {phase === "idle" ? (
        <button type="button" className="button brand record-action" onClick={beginScan}>
          {error ? "Try again" : "Begin scan"}
        </button>
      ) : null}
      {error && !live ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
