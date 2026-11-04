"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addressRegionLabel } from "../lib/address-search";
import { dataUrlBlob, sendEvidence } from "../lib/evidence-client";
import { modelRecognized } from "../lib/review-shape";
import { openRequests, type EvidenceRequest } from "../lib/evidence-requests";
import { formatClock, locationWithin, sha256Hex, type SpokenLine } from "../lib/inventory";
import { keptFromInventories, readKeptValues, rememberKeptValues } from "../lib/kept-values";
import { narrationTap, type NarrationTap } from "../lib/scan-audio";
import { makeRecorder, scaledCapture, type ScaledCapture } from "../lib/scan-capture";
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
import { applyPrices, applyReconcile, knownSoFar, linesToPrice, reconcileInput, shareKnownPrices } from "../lib/scan-pipeline";
import type { LineToPrice } from "../lib/review-scan";
import { reviewResultSchema, type PricedLine, type ReviewResult } from "../lib/review-shape";
import { spokenLineSchema } from "../lib/inventory-record";
import { AddressLine } from "./AddressLine";
import { combinePieceReviews, patchReviewItem, tagReview } from "../lib/inventory-merge";
import { useInventory } from "./InventoryProvider";
import { ItemizedRooms } from "./ItemizedRooms";
import { Loader } from "./Loader";
import { ScanGlance } from "./ScanGlance";
import { z } from "zod";

type Phase = "idle" | "starting" | "recording" | "paused" | "reviewing" | "reviewed" | "review-failed";

type RecordedPiece = { id: string; blob: Blob; audio: Blob | null; startedAt: string; durationMs: number; posterUrl: string };

type PieceResult = { review: ReviewResult; spoken: SpokenLine[] };

type PieceOutcome = { ok: true; result: PieceResult } | { ok: false; error: string; retry: boolean };

const pieceResponseSchema = z.object({ review: reviewResultSchema, spoken: z.array(spokenLineSchema).max(60) });
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

const PRICE_BATCH = 30;

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
    markProcessing,
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
    const filming = phase === "recording" || phase === "paused";
    document.body.classList.toggle("is-filming", filming);
    return () => document.body.classList.remove("is-filming");
  }, [phase]);

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

  async function priceAll(lines: LineToPrice[], idsByKey: Map<string, string[]>) {
    for (let start = 0; start < lines.length; start += PRICE_BATCH) {
      const priced = await postPrices(lines.slice(start, start + PRICE_BATCH));
      if (priced.length > 0 && combinedRef.current) combinedRef.current = applyPrices(combinedRef.current, priced, idsByKey);
    }
  }

  /** Price new lines while the next clips are still being listed. */
  function schedulePricing() {
    const pricing = pricingRef.current;
    if (pricing.running || !combinedRef.current) return;
    combinedRef.current = shareKnownPrices(combinedRef.current);
    const { lines, idsByKey, descriptions } = linesToPrice(combinedRef.current, pricing.sent);
    if (lines.length === 0) return;
    if (modeRef.current !== "done" && lines.length < 12) return;
    for (const description of descriptions) pricing.sent.add(description);
    pricing.running = true;
    void priceAll(lines, idsByKey).finally(() => {
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
    router.push("/");
    void (async () => {
      try {
        await stampStills(current.id, review);
        await identifyHighValue(current.id, review);
        setScanReview(
          current.id,
          review,
          focusIds.length > 0 ? "focus" : hadClipsRef.current ? "append" : "replace",
          focusIds,
        );
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
      } finally {
        markProcessing(current.id, false);
      }
    })();
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
          if (answer && combinedRef.current) combinedRef.current = applyReconcile(combinedRef.current, answer).review;
        }
        if (combinedRef.current) {
          combinedRef.current = shareKnownPrices(combinedRef.current);
          const { lines, idsByKey, descriptions } = linesToPrice(combinedRef.current, pricingRef.current.sent);
          if (lines.length > 0) {
            showProgress("Checking local prices");
            for (const description of descriptions) pricingRef.current.sent.add(description);
            await priceAll(lines, idsByKey);
          }
        }
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
          id: segmentId,
          blob,
          audio,
          startedAt: segmentStartedAtRef.current,
          durationMs: Math.max(0, clockRef.current.clipMs),
          posterUrl: piecePosterRef.current,
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
  const within = selected ? locationWithin(selected) : null;
  const slots = Math.round(limitMs / CLIP_MS);
  const clipNumber = Math.min(slots, clock.clips + (phase === "recording" ? 1 : 0));
  const reviewing = progress.total > progress.listed;

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
          <p className="hint">This adds up to 5 more minutes to the inventory. A repeat of something already listed is matched to its line.</p>
        ) : null}
      </div>
      {live ? (
        <div className={phase === "starting" ? "preview" : "preview is-stage"}>
          <video ref={videoRef} muted autoPlay playsInline disablePictureInPicture />
          {phase === "starting" ? (
            <div className="preview-idle">
              <Loader size={72} layout="inline" />
            </div>
          ) : null}
          {phase === "recording" ? <span className="rec-dot" aria-hidden="true" /> : null}
          <ScanGlance videoRef={videoRef} active={phase === "recording"} inventoryId={selected.id} lines={progress.lines} />
          {phase === "recording" || phase === "paused" ? (
            <div className="film-bar">
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
              <p className="record-time" aria-live="polite">
                {phase === "recording"
                  ? `Clip ${clipNumber} · ${formatClock(clock.clipMs)} of 0:30 · ${formatClock(clock.recordedMs)} of ${formatClock(limitMs)}`
                  : `Paused · ${formatClock(clock.recordedMs)} of ${formatClock(limitMs)}`}
              </p>
              {phase === "recording" ? (
                <button type="button" className="button brand" onClick={() => closeClip("pause")}>
                  Pause
                </button>
              ) : (
                <div className="film-actions">
                  <button type="button" className="button brand" onClick={resumeScan}>
                    Play
                  </button>
                  <button type="button" className="button quiet" onClick={() => closeClip("finish")}>
                    Done
                  </button>
                </div>
              )}
              {phase === "paused" ? (
                <p className="film-note">Play to continue, or Done to finish. After 15 minutes this sends what you have.</p>
              ) : null}
              {error ? (
                <p className="film-note" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
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
      {phase === "paused" && reviewing ? <p className="hint">{`Listed ${progress.listed} of ${progress.total} clips.`}</p> : null}
      {phase === "paused" && liveAsk ? (
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
      {phase === "paused" && snapNote ? <p className="hint">{snapNote}</p> : null}
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
      {error && phase !== "recording" && phase !== "paused" ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
