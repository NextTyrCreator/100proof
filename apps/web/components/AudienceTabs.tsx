"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAudience, type Audience } from "./Audience";

export function AudienceTabs() {
  const { audience, setAudience } = useAudience();
  const router = useRouter();
  const path = usePathname();
  const selected: Audience | null = audience;
  if (!selected) return null;

  function choose(next: Audience) {
    setAudience(next);
    if (path !== "/") router.push("/");
  }

  return (
    <nav className="audience-tabs" aria-label="Who this is for">
      <button type="button" aria-current={selected === "insured" ? "page" : undefined} onClick={() => choose("insured")}>
        For insured
      </button>
      <button type="button" aria-current={selected === "provider" ? "page" : undefined} onClick={() => choose("provider")}>
        For providers
      </button>
    </nav>
  );
}
