/** Record a small MP4. The camera stays sharp; the file is a 480p, 12 fps encode. */

export const CLIP_VIDEO_BPS = 700_000;
export const CLIP_AUDIO_BPS = 64_000;
const FRAME_WIDTH = 854;
const FRAME_HEIGHT = 480;
const FRAME_MS = 1000 / 12;

export function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function makeRecorder(stream: MediaStream) {
  const mimeType = pickMimeType();
  const options: MediaRecorderOptions = {
    videoBitsPerSecond: CLIP_VIDEO_BPS,
    audioBitsPerSecond: CLIP_AUDIO_BPS,
  };
  if (mimeType) options.mimeType = mimeType;
  try {
    return new MediaRecorder(stream, options);
  } catch {
    return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  }
}

export type ScaledCapture = { stream: MediaStream; stop: () => void };

/** Draw the camera onto a small canvas and capture that. Returns null when the browser cannot. */
export function scaledCapture(video: HTMLVideoElement, camera: MediaStream): ScaledCapture | null {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context || typeof canvas.captureStream !== "function") return null;

  let running = true;
  const draw = () => {
    if (!running) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width > 0 && height > 0) {
      const scale = Math.min(FRAME_WIDTH / width, FRAME_HEIGHT / height);
      const drawWidth = Math.round(width * scale);
      const drawHeight = Math.round(height * scale);
      context.fillStyle = "#0b1f3a";
      context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      context.drawImage(video, (FRAME_WIDTH - drawWidth) / 2, (FRAME_HEIGHT - drawHeight) / 2, drawWidth, drawHeight);
    }
    window.setTimeout(draw, FRAME_MS);
  };

  let stream: MediaStream;
  try {
    stream = canvas.captureStream(12);
  } catch {
    return null;
  }
  const audio = camera.getAudioTracks()[0];
  if (audio) {
    try {
      stream.addTrack(audio);
    } catch {
      // A silent picture still reviews. The microphone track stays on the camera.
    }
  }
  draw();
  return {
    stream,
    stop: () => {
      running = false;
      for (const track of stream.getVideoTracks()) track.stop();
    },
  };
}
