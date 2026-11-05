# 100proof

Film a walkthrough of your property in the phone browser. A scan runs up to 15 minutes, in 30-second clips. Two clips are reviewed at once and applied in order. Scan more on a saved inventory adds up to 5 minutes. Room chips on the camera set the room from the second you tap. You get back the items, counted and priced for replacement, kept with the video. The record has a sealed hash, a JSON claim file, and a CSV with sources. The homeowner can delete an inventory. Every model call is written to `cost_ledger`. 100proof does not decide coverage. No accuracy rate is claimed.

**Built for the Meta Global AI Developer Hackathon, Oct 26 – Nov 4, 2026.** All code in this repository was written during the event. First commit: `2026-10-26T17:20:01Z` (`9a51175`). Index of what was built: [`docs/BUILT_DURING_HACKATHON.md`](docs/BUILT_DURING_HACKATHON.md).

Two Meta models run in the product. Muse Spark 1.3 lists each 30-second clip from the video and the transcript, reads label close-ups, prices lines by web search, reconciles repeats and fills brand, model, serial, and color at Done, and reads receipts. Every model response is validated with zod before it touches a line. Untrusted text is data, never instructions. Muse Voice Transcribe 1.0 transcribes narration with timestamps.

Demo: https://demo.100proof.tech · Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md) (written on kickoff day; no product code).

[`FEATURES.md`](FEATURES.md) lists each feature with its status. The five-run rule is [`docs/SCORECARD.md`](docs/SCORECARD.md): the accuracy rate is the average match score, in percent, of five separately scored walks. The target is 95 on every run and on the average. Sample variance above 4 (a standard deviation of 2 points) marks the walks inconsistent. The rate is withheld until five scored runs exist, and a pending or rejected run withholds the series. No run has been scored. 95 is a research bar, not a claim. Planned, in [`docs/SCAN_PREP_PLAN.md`](docs/SCAN_PREP_PLAN.md) and [`FEATURES.md`](FEATURES.md): read twice for items over $250, a proof ledger, tap to replay, a before-and-after walk, what-belongs-here prompts, research findings as a question, and cross-room duplicate merging. The timed demo script is [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

## Repository map

| Path | What lives there |
| --- | --- |
| `apps/web` | Next.js app: sign-in, the scan, the inventory, and Connections. The scan pipeline is here: routes under `apps/web/app/api/scan/*`, and `apps/web/lib/review-scan.ts`, `review-shape.ts`, `scan-pipeline.ts`, `scan-rooms.ts`, `inventory-merge.ts` |
| `apps/worker` | Placeholder README. The scan pipeline runs in `apps/web`. Moving model work to Inngest is planned |
| `packages/schema` | Placeholder README |
| `packages/meta-client` | Meta Model API wrapper |
| `packages/insurance` | Placeholder README |
| `packages/ui` | Brand tokens and the logo |
| `infra` | Placeholder `docker-compose.yml` with an empty service list |
| `samples` | Sample rooms filmed in the house during the event, as the house is prepared |
| `docs` | Engineering standards, ADRs, env register, judging map, build log |
| `legal` | Privacy Policy, Terms of Service, cookie spec, data inventory (drafts) |

## How we work
[`CONTRIBUTING.md`](CONTRIBUTING.md): branch model, commit convention with AI-attribution and approval trailers.
[`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md): security, performance, data and observability rules every PR is checked against.
[`SECURITY.md`](SECURITY.md): how to report a vulnerability.

## Running locally

Node 22 or newer (`engines` in `package.json`).

```bash
corepack pnpm install
```

Copy `.env.example` to `apps/web/.env.local` and fill it in. Then:

```bash
corepack pnpm --filter @100proof/web dev
```

Open http://localhost:3000.

Checks:

```bash
corepack pnpm exec tsc --noEmit -p apps/web
corepack pnpm --filter @100proof/web harness
corepack pnpm exec knip --no-config-hints
```

`harness` is deterministic and makes no model calls. The model eval is `corepack pnpm --filter @100proof/web eval scripts/eval/cases/<case>.json` ([`docs/EVAL.md`](docs/EVAL.md)).

## License
Apache-2.0. Keep the `LICENSE` file GitHub generated.
