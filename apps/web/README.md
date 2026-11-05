# apps/web

Next.js app for the demo. Home, a live scan of up to 15 minutes in 30-second clips (Scan more adds up to 5 minutes), Connections for receipts, and the inventory document use the brand tokens in `packages/ui`.

```bash
corepack pnpm --filter @100proof/web dev
```

Open http://localhost:3000. The first screen is an email one-time code. The inventory starts empty. Muse Spark 1.3 lists each clip from the video and the transcript. Muse Voice Transcribe 1.0 transcribes the narration.
