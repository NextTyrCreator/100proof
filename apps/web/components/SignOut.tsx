"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "../lib/supabase/browser";

export function SignOut({ className = "text-button" }: { className?: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" className={className} onClick={signOut}>
      Log out
    </button>
  );
}
