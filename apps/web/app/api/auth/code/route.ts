import { NextResponse } from "next/server";
import { z } from "zod";
import { allowCodeSend, clientIp, rememberCodeSent } from "../../../../lib/email-code-limit";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });

  const ip = clientIp(request);
  const gate = allowCodeSend(parsed.data.email, ip);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, retryAfterMs: gate.retryAfterMs, reason: gate.reason },
      { status: 429 },
    );
  }

  const supabase = await createServerSupabase();
  const origin = request.headers.get("origin") || new URL(request.url).origin;
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    const wait = /after (\d+) seconds?/i.exec(error.message);
    if (wait) {
      return NextResponse.json(
        { ok: false, retryAfterMs: Number(wait[1]) * 1000, reason: "wait" },
        { status: 429 },
      );
    }
    const lower = error.message.toLowerCase();
    if (lower.includes("rate")) {
      return NextResponse.json({ ok: false, retryAfterMs: 60_000, reason: "locked" }, { status: 429 });
    }
    return NextResponse.json({ error: "The code could not be sent. Try again." }, { status: 502 });
  }

  const replacesPrevious = rememberCodeSent(parsed.data.email, ip);
  return NextResponse.json({ ok: true, replacesPrevious });
}
