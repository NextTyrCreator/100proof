"use client";

import { useEffect, useRef, useState } from "react";
import { clipFrame } from "../lib/clip-frames";

/** A frame from the kept clip, cut only once the picture scrolls into view. */
export function ClipFrame({ src, atSec, className }: { src: string; atSec: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let live = true;
    void clipFrame(src, atSec).then((next) => {
      if (live) setUrl(next);
    });
    return () => {
      live = false;
    };
  }, [near, src, atSec]);

  return (
    <span ref={ref} className={className}>
      {url ? (
        // The frame is cut on this device from the clip kept with this inventory.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : null}
    </span>
  );
}
