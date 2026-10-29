# apps/web

Next.js app for the demo. Home, a live scan of up to 5 minutes in 30-second clips, and the inventory document use the brand tokens in `packages/ui`.

```bash
corepack pnpm --filter @100proof/web dev
```

Open http://localhost:3000. The first screen is an email code. The inventory starts empty. Recognition is not wired yet.
