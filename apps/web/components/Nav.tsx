"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [{ href: "/", label: "My inventory" }];

export function Nav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const path = usePathname();

  return (
    <nav className="nav" aria-label="Primary">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          aria-current={path === "/" || path === "/inventory" ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
