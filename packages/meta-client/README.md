# packages/meta-client

Server-only wrapper for the Meta Model API. Do not import it from a client component.

The wrapper defines these model IDs: `muse-spark-1.3`, `muse-voice-transcribe-1.0`, `muse-wonder-1.0`, `sam-3.1`, and `muse-image-1.0`. The product calls only Muse Spark 1.3 and Muse Voice Transcribe 1.0.

It reads `META_MODEL_API_KEY`. `META_MODEL_API_BASE_URL` is optional and defaults to `https://api.meta.ai/v1`.

It uploads a file for `user_data` and returns the file id. It can delete that file, and a failed delete is ignored. It transcribes a mono 16-bit WAV with Muse Voice Transcribe 1.0 in endpointing mode, strips speaker markers from the text, and returns the transcript plus each turn's start and end time. It posts a caller-built JSON body to `/responses` and returns the output text and status. A 429 or a 5xx is tried again, twice by default, or once when the caller asks for a single try.
