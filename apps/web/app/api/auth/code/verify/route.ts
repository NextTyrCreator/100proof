import { NextResponse } from "next/server";
import { z } from "zod";
import { allowCodeGuess, rememberCodeGuess } from "../../../../../lib/email-code-limit";
import { createServerSupabase } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{8}$/),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter the code from the email." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Enter the 8-digit code from the email." }, { status: 400 });

  const gate = allowCodeGuess(parsed.data.email);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, retryAfterMs: gate.retryAfterMs, reason: "locked" },
      { status: 429 },
    );
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "email",
  });
  if (error) {
    rememberCodeGuess(parsed.data.email, false);
    const again = allowCodeGuess(parsed.data.email);
    if (!again.ok) {
      return NextResponse.json(
        { ok: false, retryAfterMs: again.retryAfterMs, reason: "locked" },
        { status: 429 },
      );
    }
    const lower = error.message.toLowerCase();
    const text = lower.includes("expired")
      ? "This code expired. Send a new one."
      : "That code didn't match. Check the email and try again.";
    return NextResponse.json({ error: text }, { status: 400 });
  }

  rememberCodeGuess(parsed.data.email, true);
  return NextResponse.json({ ok: true });
}
