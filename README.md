# 100proof

Film a 100-second walkthrough of your home. Get back a verifiable, insurance-grade personal property inventory: every item recognized, counted, valued from your own receipts where they exist, bucketed into the categories insurers already use, and sealed so a carrier can verify it without taking anyone's word for it.

**Built for the Meta Global AI Developer Hackathon, Oct 26 – Nov 4, 2026.** All code in this repository was written during the event. First commit: `2026-10-26T17:20:01Z` (`9a51175`). Index of what was built: [`docs/BUILT_DURING_HACKATHON.md`](docs/BUILT_DURING_HACKATHON.md).

Meta Model API: SAM 3.1 (detect, mask, track) · Muse Spark 1.3 (video → items, receipt parsing) · Muse Wonder (household agents) · Muse Image (catalog shots).

Demo: https://demo.100proof.tech · Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md) (pre-event planning; no code).

## Repository map

| Path | What lives there |
| --- | --- |
| `apps/web` | Next.js app: coming-soon root, demo app, packet viewer, `/verify` |
| `apps/worker` | Scan pipeline, household agents, ffmpeg, Meta model calls, eval harness |
| `packages/schema` | Zod schemas and Drizzle migrations: Item, Scan, Master, Packet, Evidence (single source of truth) |
| `packages/meta-client` | Meta Model API wrapper: model IDs, retries, rate limits, cost accounting |
| `packages/insurance` | ISO/HOB special-limit tables, category taxonomy, depreciation tables |
| `packages/ui` | Shared components, skeletons, design tokens |
| `infra` | docker-compose, Fly.io config |
| `samples` | Staged sample rooms and synthetic receipts (recorded during the event) |
| `docs` | Engineering standards, ADRs, env register, judging map, build log |
| `legal` | Privacy Policy, Terms of Service, cookie spec, data inventory (drafts) |

## How we work
[`CONTRIBUTING.md`](CONTRIBUTING.md): branch model, commit convention with AI-attribution and approval trailers.
[`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md): security, performance, data and observability rules every PR is checked against.
[`SECURITY.md`](SECURITY.md): how to report a vulnerability.

## Running locally
Day 1 vertical slice lands under `apps/`; until then this README is the repository. Quickstart will read: `pnpm i && cp .env.example .env.local && pnpm dev`.

## License
Apache-2.0. Keep the `LICENSE` file GitHub generated.
