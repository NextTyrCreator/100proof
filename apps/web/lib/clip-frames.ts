/**
 * The picture for a line: the frame of its clip at the second the item was clearest.
 * It is cut on this device from the kept clip, one at a time, and held in memory. Nothing is uploaded.
 */

const cache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

const WIDTH = 320;
const TIMEOUT_MS = 8000;

function cut(src: string, atSec: number): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), TIMEOUT_MS);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (!src.startsWith("blob:")) video.crossOrigin = "anonymous";
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.1) : atSec;
      video.currentTime = Math.min(Math.max(0.05, atSec), end);
    };
    video.onseeked = () => {
      const height = Math.round((WIDTH * (video.videoHeight || 9)) / (video.videoWidth || 16));
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return done(null);
      try {
        context.drawImage(video, 0, 0, WIDTH, height);
        canvas.toBlob((blob) => done(blob ? URL.createObjectURL(blob) : null), "image/jpeg", 0.7);
      } catch {
        done(null);
      }
    };
    video.src = src;
  });
}

/**
 * Several frames from one clip, loading it once. Each second is a JPEG, or null when that seek did not
 * finish. Used to finish a scan whose stills were not saved; the line view still uses `clipFrame`.
 */
export function cutFrames(src: string, seconds: number[], width = 640): Promise<(Blob | null)[]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const out: (Blob | null)[] = seconds.map(() => null);
    let index = 0;
    let timer = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(out);
    };
    const arm = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        index += 1;
        next();
      }, ms);
    };
    const next = () => {
      if (index >= seconds.length) return finish();
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.1) : seconds[index]!;
      arm(5000);
      video.currentTime = Math.min(Math.max(0.05, seconds[index]!), end);
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (!src.startsWith("blob:")) video.crossOrigin = "anonymous";
    video.onerror = finish;
    video.onloadedmetadata = next;
    video.onseeked = () => {
      const at = index;
      const height = Math.round((width * (video.videoHeight || 9)) / (video.videoWidth || 16));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      const advance = () => {
        if (at !== index) return;
        index += 1;
        next();
      };
      if (!context) return advance();
      try {
        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob((blob) => {
          out[at] = blob;
          advance();
        }, "image/jpeg", 0.8);
      } catch {
        advance();
      }
    };
    timer = window.setTimeout(finish, 15000);
    video.src = src;
  });
}

export function clipFrame(src: string, atSec: number) {
  const key = `${src.split("?")[0]}#${Math.round(atSec * 2) / 2}`;
  const known = cache.get(key);
  if (known) return known;
  const next = queue.then(() => cut(src, atSec));
  queue = next.catch(() => null);
  cache.set(key, next);
  return next;
}
