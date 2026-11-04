"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAudience } from "./Audience";

export function Nav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const path = usePathname();
  const { audience } = useAudience();
  const onInventory = (path === "/" || path === "/inventory") && audience !== "provider";
  const onProviders = path === "/" && audience === "provider";

  return (
    <nav className="nav" aria-label="Primary">
      <Link href="/" onClick={onNavigate} aria-current={onInventory ? "page" : undefined}>
        <NavIcon name="inventory" />
        <span>My inventory</span>
      </Link>
      <div className="nav-break" role="separator" />
      <Link href="/?for=providers" onClick={onNavigate} aria-current={onProviders ? "page" : undefined}>
        <NavIcon name="providers" />
        <span>For providers</span>
      </Link>
      <Link href="/information" onClick={onNavigate} aria-current={path === "/information" ? "page" : undefined}>
        <NavIcon name="information" />
        <span>Information</span>
      </Link>
    </nav>
  );
}

function NavIcon({ name }: { name: "inventory" | "providers" | "information" }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "inventory" ? (
        <path d="M5 7.5h14M5 12h14M5 16.5h9" />
      ) : name === "providers" ? (
        <>
          <path d="M4.5 20V9.5L12 4.5l7.5 5V20" />
          <path d="M9.5 20v-5.5h5V20" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="7.25" />
          <path d="M12 11v5" />
          <circle cx="12" cy="8.15" r="0.9" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
