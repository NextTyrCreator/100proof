import type { Metadata } from "next";
import { Suspense } from "react";
import { Connections } from "../../components/Connections";

export const metadata: Metadata = { title: "Connections", robots: { index: false, follow: false } };

export default function ConnectionsPage() {
  return (
    <Suspense fallback={null}>
      <Connections />
    </Suspense>
  );
}
