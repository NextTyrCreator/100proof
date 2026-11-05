"use client";

import { useRef, useState } from "react";
import { formatClock, type SpokenLine } from "../lib/inventory";
import { replayCaption, replayWindow } from "../lib/replay";

/**
 * Tap to replay: the seconds a line was filmed, with what was said in those seconds captioned underneath.
 * The clip opens through the same expiring link as the line's stills. Nothing is downloaded until it plays.
 */
export function LineReplay({ src, atSec, durationMs, spoken, label }: { src: string; atSec: number; durationMs: number; spoken: SpokenLine[]; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const span = replayWindow(atSec, durationMs);
  const caption = nowMs == null ? "" : replayCaption(spoken, nowMs, span);

  function play() {
    setOpen(true);
    requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = span.startMs / 1000;
      void video.play().catch(() => undefined);
    });
  }

  return (
    <div className="line-replay">
      <button type="button" className="button quiet line-replay-play" onClick={play}>
        Replay {label}
      </button>
      {open ? (
        <figure className="line-replay-stage">
          <video
            ref={videoRef}
            src={src}
            muted={false}
            playsInline
            preload="metadata"
            disablePictureInPicture
            onTimeUpdate={(event) => {
              const ms = event.currentTarget.currentTime * 1000;
              setNowMs(ms);
              if (ms >= span.endMs) event.currentTarget.pause();
            }}
          />
          <figcaption aria-live="polite">
            <span className="line-replay-when">
              {formatClock(span.startMs)} to {formatClock(span.endMs)}
            </span>
            {caption ? <span className="line-replay-said">“{caption}”</span> : <span className="line-replay-said is-quiet">Nothing was said here.</span>}
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
