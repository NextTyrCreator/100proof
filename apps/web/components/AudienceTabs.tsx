"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAudience, type Audience } from "./Audience";

export function AudienceTabs() {
  const { audience, setAudience } = useAudience();
  const router = useRouter();
  const path = usePathname();
  const onInformation = path === "/information";

  function choose(next: Audience) {
    setAudience(next);
    if (path !== "/") router.push("/");
  }

  return (
    <nav className="audience-tabs" aria-label="Who this is for">
      <button
        type="button"
        aria-current={!onInformation && audience === "insured" ? "page" : undefined}
        onClick={() => choose("insured")}
      >
        For insured
      </button>
      <button
        type="button"
        aria-current={!onInformation && audience === "provider" ? "page" : undefined}
        onClick={() => choose("provider")}
      >
        For providers
      </button>
      <Link href="/information" aria-current={onInformation ? "page" : undefined}>
        Information
      </Link>
    </nav>
  );
}
