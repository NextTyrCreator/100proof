"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "My inventory", current: (path: string) => path === "/" || path === "/inventory" },
  { href: "/information", label: "Information", current: (path: string) => path === "/information" },
];

export function Nav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const path = usePathname();

  return (
    <nav className="nav" aria-label="Primary">
      {links.map((link) => (
        <Link key={link.href} href={link.href} onClick={onNavigate} aria-current={link.current(path) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
