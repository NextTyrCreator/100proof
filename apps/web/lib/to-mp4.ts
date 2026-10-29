import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function ensureMp4(bytes: Buffer, mediaType: string) {
  if (mediaType.includes("mp4")) return bytes;
  const dir = await mkdtemp(join(tmpdir(), "proof-"));
  const input = join(dir, "in.webm");
  const output = join(dir, "out.mp4");
  try {
    await writeFile(input, bytes);
    await exec(
      "ffmpeg",
      ["-y", "-i", input, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output],
      { timeout: 120_000 },
    );
    return await readFile(output);
  } catch {
    throw new Error("This recording is not MP4, which the review needs. Scan again in Chrome or Safari.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
