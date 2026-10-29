"use client";

import { createContext, useContext, useState } from "react";

export type Audience = "insured" | "provider";

type AudienceContextValue = {
  audience: Audience;
  setAudience: (audience: Audience) => void;
};

const AudienceContext = createContext<AudienceContextValue | null>(null);

/** Every page load starts on For insured. The choice lasts until the next load. */
export function AudienceProvider({ children }: { children: React.ReactNode }) {
  const [audience, setAudience] = useState<Audience>("insured");
  return <AudienceContext.Provider value={{ audience, setAudience }}>{children}</AudienceContext.Provider>;
}

export function useAudience() {
  const value = useContext(AudienceContext);
  if (!value) throw new Error("useAudience must be used inside AudienceProvider");
  return value;
}
