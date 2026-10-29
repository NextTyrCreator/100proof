import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ModelCall } from "./review-scan";

const orgIdSchema = z.string().uuid();

/** The signed-in person's own organization. Created on first use. */
export async function personalOrg(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("ensure_personal_org");
  if (error) throw new Error("The account could not be opened.");
  return orgIdSchema.parse(data);
}

/** Best effort. A ledger miss never fails the review the person is waiting on. */
export async function recordCalls(supabase: SupabaseClient, inventoryId: string | null, calls: ModelCall[]) {
  if (calls.length === 0) return;
  try {
    const orgId = await personalOrg(supabase);
    await supabase.from("cost_ledger").insert(
      calls.map((call) => ({
        org_id: orgId,
        inventory_id: inventoryId,
        call: call.call,
        model: call.model,
        ok: call.ok,
        latency_ms: Math.max(0, Math.round(call.latencyMs)),
        bytes_in: Math.max(0, Math.round(call.bytesIn)),
        audio_ms: call.audioMs,
      })),
    );
  } catch {
    // The review already succeeded.
  }
}

export const uuidSchema = z.string().uuid();
