/** Keep the narration as 16 kHz mono 16-bit WAV, one file per clip, for Muse Voice Transcribe. */

const RATE = 16_000;
const FRAME = 4096;

export type NarrationTap = {
  /** Start or stop keeping samples. Paused time is not in the file. */
  setOn: (on: boolean) => void;
  /** The narration since the last take, as a WAV. Null when nothing was heard. */
  take: () => Blob | null;
  stop: () => void;
};

function wav(samples: Int16Array) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);
  return new Blob([buffer], { type: "audio/wav" });
}

/** Returns null when the browser has no Web Audio or no microphone track. */
export function narrationTap(stream: MediaStream): NarrationTap | null {
  const track = stream.getAudioTracks()[0];
  const Context =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!track || !Context) return null;

  let context: AudioContext;
  try {
    context = new Context();
  } catch {
    return null;
  }
  void context.resume().catch(() => undefined);
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const processor = context.createScriptProcessor(FRAME, 1, 1);
  const silent = context.createGain();
  silent.gain.value = 0;

  const step = context.sampleRate / RATE;
  let on = false;
  let carry = 0;
  let chunks: Int16Array[] = [];
  let length = 0;

  processor.onaudioprocess = (event) => {
    if (!on) return;
    const input = event.inputBuffer.getChannelData(0);
    const out = new Int16Array(Math.floor((input.length - carry) / step) + 1);
    let written = 0;
    let position = carry;
    while (position < input.length) {
      const sample = Math.max(-1, Math.min(1, input[Math.floor(position)] ?? 0));
      out[written] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      written += 1;
      position += step;
    }
    carry = position - input.length;
    const kept = out.subarray(0, written);
    chunks.push(kept);
    length += kept.length;
  };

  source.connect(processor);
  processor.connect(silent);
  silent.connect(context.destination);

  return {
    setOn(next) {
      on = next;
      if (next) void context.resume().catch(() => undefined);
    },
    take() {
      if (length < RATE / 2) {
        chunks = [];
        length = 0;
        return null;
      }
      const samples = new Int16Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      chunks = [];
      length = 0;
      return wav(samples);
    },
    stop() {
      on = false;
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      silent.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
