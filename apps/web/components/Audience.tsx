"use client";

import { createContext, useContext, useState } from "react";

export type Audience = "insured" | "provider";

type AudienceContextValue = {
  audience: Audience | null;
  setAudience: (audience: Audience) => void;
};

const AudienceContext = createContext<AudienceContextValue | null>(null);

function writeAudience(audience: Audience) {
  document.cookie = `100proof_audience=${audience}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function AudienceProvider({
  initial,
  children,
}: {
  initial: Audience | null;
  children: React.ReactNode;
}) {
  const [audience, setAudienceState] = useState<Audience | null>(initial);

  function setAudience(next: Audience) {
    writeAudience(next);
    setAudienceState(next);
  }

  return <AudienceContext.Provider value={{ audience, setAudience }}>{children}</AudienceContext.Provider>;
}

export function useAudience() {
  const value = useContext(AudienceContext);
  if (!value) throw new Error("useAudience must be used inside AudienceProvider");
  return value;
}
