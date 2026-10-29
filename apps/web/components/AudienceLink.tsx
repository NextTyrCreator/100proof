"use client";

import Link from "next/link";
import { useAudience, type Audience } from "./Audience";

/** A link to the home screen that opens on the given tab. */
export function AudienceLink({ audience, className, children }: { audience: Audience; className?: string; children: React.ReactNode }) {
  const { setAudience } = useAudience();
  return (
    <Link href={audience === "provider" ? "/?for=providers" : "/"} className={className} onClick={() => setAudience(audience)}>
      {children}
    </Link>
  );
}
