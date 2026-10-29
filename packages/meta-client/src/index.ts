export const META_MODELS = {
  spark: "muse-spark-1.3",
  wonder: "muse-wonder-1.0",
  voice: "muse-voice-transcribe-1.0",
  sam: "sam-3.1",
  image: "muse-image-1.0",
} as const;

type MetaConfig = { key: string; baseUrl: string };

function config(): MetaConfig {
  const key = process.env.META_MODEL_API_KEY?.trim();
  if (!key) throw new Error("The review service is not configured.");
  const baseUrl = (process.env.META_MODEL_API_BASE_URL?.trim() || "https://api.meta.ai/v1").replace(/\/$/, "");
  return { key, baseUrl };
}

function authHeaders(key: string) {
  return { Authorization: `Bearer ${key}` };
}

export async function uploadUserFile(file: Blob, filename: string) {
  const { key, baseUrl } = config();
  const body = new FormData();
  body.set("purpose", "user_data");
  body.set("file", file, filename);
  const response = await fetch(`${baseUrl}/files`, {
    method: "POST",
    headers: authHeaders(key),
    body,
  });
  if (!response.ok) {
    throw new Error(`The review service could not take the walkthrough (${response.status}).`);
  }
  const payload = (await response.json()) as { id?: string };
  if (!payload.id) throw new Error("The review service did not return a file id.");
  return payload.id;
}

export async function deleteUserFile(id: string) {
  const { key, baseUrl } = config();
  await fetch(`${baseUrl}/files/${id}`, { method: "DELETE", headers: authHeaders(key) }).catch(() => undefined);
}

export type SpokenTurn = { startMs: number; endMs: number; text: string };

/** The service can return speaker markers such as `<|speaker_A|>` inside the text. */
export function cleanTranscript(text: string) {
  return text.replace(/<\|[^|>]{0,40}\|>/g, " ").replace(/\s+/g, " ").trim();
}

/** Mono 16-bit WAV at 16 or 24 kHz. Returns the turns with their times inside the clip. */
export async function transcribeWav(audio: Blob, timeoutMs: number): Promise<{ transcript: string; turns: SpokenTurn[] }> {
  const { key, baseUrl } = config();
  const body = new FormData();
  body.set(
    "request",
    new Blob([JSON.stringify({ model: META_MODELS.voice, audioEncoding: "WAV", mode: "ENDPOINTING" })], {
      type: "application/json",
    }),
  );
  body.set("audio", audio, "narration.wav");
  const response = await fetch(`${baseUrl}/asr/transcribe`, {
    method: "POST",
    headers: { ...authHeaders(key), Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`The narration service returned ${response.status}.`);
  const payload = (await response.json()) as {
    transcript?: unknown;
    turns?: Array<{ startMs?: unknown; endMs?: unknown; transcript?: unknown }>;
  };
  const turns: SpokenTurn[] = [];
  for (const turn of payload.turns ?? []) {
    if (typeof turn.transcript !== "string") continue;
    const text = cleanTranscript(turn.transcript);
    if (!text) continue;
    const startMs = typeof turn.startMs === "number" && Number.isFinite(turn.startMs) ? Math.max(0, turn.startMs) : 0;
    const endMs = typeof turn.endMs === "number" && Number.isFinite(turn.endMs) ? Math.max(startMs, turn.endMs) : startMs;
    turns.push({ startMs, endMs, text });
  }
  const transcript =
    typeof payload.transcript === "string" ? cleanTranscript(payload.transcript) : turns.map((turn) => turn.text).join(" ");
  return { transcript, turns };
}

export type MetaText = { text: string; status: string };

/** `attempts` is how many tries a 429 or 5xx gets. A call that must finish inside a page request uses 1. */
export async function createResponse(body: Record<string, unknown>, timeoutMs: number, attempts = 2): Promise<MetaText> {
  const { key, baseUrl } = config();
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { ...authHeaders(key), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    lastStatus = response.status;
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      continue;
    }
    if (!response.ok) {
      throw new Error(`The review service returned ${response.status}.`);
    }
    const payload = (await response.json()) as {
      status?: string;
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const parts: string[] = [];
    if (typeof payload.output_text === "string") parts.push(payload.output_text);
    for (const item of payload.output ?? []) {
      for (const block of item.content ?? []) {
        if (block.type === "output_text" && typeof block.text === "string") parts.push(block.text);
      }
    }
    return { text: parts.join("\n").trim(), status: payload.status ?? "completed" };
  }
  throw new Error(`The review service returned ${lastStatus}.`);
}
