"use client";

import { usePathname } from "next/navigation";

export function PageFade({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="page-enter">
      {children}
    </div>
  );
}
