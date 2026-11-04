"use client";

import Link from "next/link";
import type { Audience } from "./Audience";

/** Moves between the home screens without reloading the header. */
export function AudienceLink({ audience, className, children }: { audience: Audience; className?: string; children: React.ReactNode }) {
  return (
    <Link href={audience === "provider" ? "/?for=providers" : "/"} className={className}>
      {children}
    </Link>
  );
}
