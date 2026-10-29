"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { z } from "zod";

const glanceSchema = z.object({ seen: z.array(z.string().trim().min(1).max(40)).max(4) });

/** At most one glance every few seconds, and only when the view has changed. */
const MIN_GAP_MS = 4000;
const REFRESH_MS = 15_000;
const STALE_MS = 12_000;
const CHANGE_THRESHOLD = 12;

/** A 32×18 grey thumbnail, to tell whether the camera has moved. */
function signature(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  canvas.width = 32;
  canvas.height = 18;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || video.videoWidth === 0) return null;
  context.drawImage(video, 0, 0, 32, 18);
  const pixels = context.getImageData(0, 0, 32, 18).data;
  const grey = new Uint8Array(32 * 18);
  for (let index = 0; index < grey.length; index += 1) {
    const at = index * 4;
    grey[index] = ((pixels[at] ?? 0) * 3 + (pixels[at + 1] ?? 0) * 6 + (pixels[at + 2] ?? 0)) / 10;
  }
  return grey;
}

function difference(a: Uint8Array, b: Uint8Array) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  return sum / a.length;
}

function smallFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<Blob | null> {
  const width = 384;
  const height = Math.round((width * (video.videoHeight || 9)) / (video.videoWidth || 16));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
}

/**
 * The live scanner. While the camera is recording and this tab is in front, it names what is in view.
 * These names are display only. The clip's review lists the items.
 */
export function ScanGlance({
  videoRef,
  active,
  inventoryId,
  lines,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  inventoryId: string;
  lines: number;
}) {
  const [seen, setSeen] = useState<{ names: string[]; at: number }>({ names: [], at: 0 });
  const [visible, setVisible] = useState(true);
  const busyRef = useRef(false);
  const lastRef = useRef<{ at: number; sig: Uint8Array | null }>({ at: 0, sig: null });

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!active || !visible) return;
    const canvas = document.createElement("canvas");
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const now = Date.now();
      if (!video || busyRef.current || now - lastRef.current.at < MIN_GAP_MS) return;
      const sig = signature(video, canvas);
      if (!sig) return;
      const last = lastRef.current.sig;
      const moved = !last || difference(sig, last) > CHANGE_THRESHOLD;
      if (!moved && now - lastRef.current.at < REFRESH_MS) return;
      busyRef.current = true;
      lastRef.current = { at: now, sig };
      void smallFrame(video, canvas)
        .then(async (frame) => {
          if (!frame) return;
          const body = new FormData();
          body.set("frame", new File([frame], "glance.jpg", { type: "image/jpeg" }));
          body.set("inventoryId", inventoryId);
          const response = await fetch("/api/scan/glance", { method: "POST", body });
          const parsed = glanceSchema.safeParse(await response.json().catch(() => null));
          if (parsed.success && parsed.data.seen.length > 0) setSeen({ names: parsed.data.seen, at: Date.now() });
        })
        .catch(() => undefined)
        .finally(() => {
          busyRef.current = false;
        });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, visible, videoRef, inventoryId]);

  useEffect(() => {
    if (seen.names.length === 0) return;
    const timer = window.setTimeout(() => setSeen((current) => (Date.now() - current.at >= STALE_MS ? { names: [], at: 0 } : current)), STALE_MS);
    return () => window.clearTimeout(timer);
  }, [seen]);

  if (!active) return null;
  return (
    <div className="scan-glance" aria-live="polite">
      <span className="scan-frame" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="scan-sweep" aria-hidden="true" />
      <div className="scan-readout">
        <p className="scan-seen">
          {seen.names.length > 0 ? (
            <>
              <span className="scan-seen-label">In view</span>
              {seen.names.map((name) => (
                <span className="scan-chip" key={name}>
                  {name}
                </span>
              ))}
            </>
          ) : (
            <span className="scan-seen-label">Scanning</span>
          )}
        </p>
        {lines > 0 ? <p className="scan-count">{lines === 1 ? "1 line listed" : `${lines} lines listed`}</p> : null}
      </div>
    </div>
  );
}
