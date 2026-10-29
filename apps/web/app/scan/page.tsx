import { Suspense } from "react";
import { Walkthrough } from "../../components/Walkthrough";

export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <Walkthrough />
    </Suspense>
  );
}
