# Vercel + Neon deployment

Status on October 3, 2026: [DoodleQuest is deployed](https://doodlequest-six.vercel.app) in example mode. Hosted HTTPS checks passed for Neon connectivity, sample drafts, approval, publication, isolated ownership, snapshot immutability, drawing-byte persistence across redeployment, and revocation. The rendered 3D example was visually verified and its story completed through the accessible controls to the letter. See [dated hosted verification](COMPLETION.md#vercel-and-neon-hosted-verification--2026-10-03).

The deployment uses Vercel Hobby and the dedicated Neon Free resource `neon-coffee-globe`, connected to DoodleQuest's production environment only. The deployed application revision is `37cac02`, now included in `main` through [PR #1](https://github.com/Xuefeng-Zhu/DoodleQuest/pull/1), merged at `56c6344`. No paid tier was selected and no Tripo credentials were transferred or provider calls made.

The authenticated Vercel CLI deployed a clean Git archive of `37cac02`; Git auto-deployment is not configured for this project. Future updates can use the CLI again or intentionally connect the tested source branch. Pushing to GitHub alone does not update production.

## Configuration

Use Node.js 24 and the Next.js framework preset. Build with `npm run build`; Vercel owns the request and Workflow processes. Do not use the Render launcher or a standalone worker on Vercel.

Required production settings:

| Variable                     | Value                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`               | Neon pooled connection string; integration-managed, encrypted |
| `GENERATION_QUOTA`           | `0` for the initial example deployment                        |
| `ASSET_STORAGE_BUDGET_BYTES` | `209715200` (200 MiB of asset payloads)                       |
| `E2E_MOCK_PROVIDER`          | `0`                                                           |
| `TRIPO_API_KEY`              | Unset until separately authorized for hosted live use         |

Omit `APP_ORIGIN` to use Vercel's production domain or the isolated preview URL. A custom domain needs its exact HTTPS origin. Do not upload `.env.local` or private local data. Connect a separate Neon branch/database for preview writes if preview testing is enabled; do not silently reuse production data.

`DATABASE_URL` is mandatory on Vercel: the app refuses to use ephemeral local storage. Initialization is lazy, idempotent and protected by a PostgreSQL advisory lock, so the build does not connect to the database.

## Persistence and execution

PostgreSQL stores sessions, drafts, immutable gift snapshots, quota history, job leases and PNG/GLB bytes. Asset writes, quota reservations and gift mutations use transactions. A default 200 MiB payload budget leaves room for database metadata, although database storage and transfer must still be monitored in Neon. Deleting a project removes its private bytes and gift access; lifetime generation usage remains.

Drawing uploads share a 25 MiB hourly limit across all sessions, charged using both normalized PNGs rather than compressed request size. Failed storage writes refund that reservation. Replacing a drawing reclaims its old bytes unless they remain referenced by a published gift or generation job. This bounds rapid anonymous storage growth while keeping saved keepsakes available.

Each Workflow run advances one persisted generation or motion job. Workflow inputs contain only job IDs and scheduling metadata. Provider keys and image/model bytes stay inside the Node.js step. Duplicate enqueue requests share a deterministic hook and fenced database leases. An interrupted provider submission without a saved task ID stops as uncertain rather than automatically spending again. A run is bounded to 720 advances; owner status polling can resume the same durable task if a run stops or enqueueing was interrupted.

Uploads are clamped below 4 MiB including reserved multipart overhead. Authorized asset responses stream in chunks so models up to the existing 25 MiB validation budget can load through Vercel. Gift revocation and owner checks apply before streaming.

Local `npm run dev` uses the same Workflow integration and embedded PostgreSQL when `DATABASE_URL` is empty. Browser tests explicitly blank database/provider credentials and use a temporary database and mock provider. The old SQLite database and assets are left untouched; this deployment starts with a new database and does not publish private local gifts.

## Acceptance checks

- Passed locally: PostgreSQL tests: ownership, rate/credit quotas, snapshot immutability, deletion and asset rollback.
- Passed locally: Workflow application tests and compiled mock browser flows: job-specific claims, enqueue recovery and duplicate protection.
- Passed: production build, private-file trace exclusions, native PostgreSQL 17.11 restart/concurrency smoke, and all 42 distinct browser cases across the full run and one focused rerun.
- Passed over hosted HTTPS: public homepage, database readiness, example mode/upload limit, secure isolated creator sessions, sample draft storage and approval, correct-origin publication, saved configuration/share state, matching creator and recipient drawing hashes, private asset denial for anonymous/foreign creators, anonymous snapshot/page access, and snapshot immutability after draft edits.
- Passed in the hosted browser: visually rendered procedural 3D example and complete story through accessible controls to the letter.
- Passed in the hosted creator/recipient browser flow: sample selection, approval, personalization, save/reload, publication, a rendered recipient scene with the saved title/name, and an unavailable-link message after revocation and recipient reload. See the [sanitized record](../evidence/vercel-neon/verification.json) and [example screenshot](../evidence/vercel-neon/published-example.png).
- Passed after a fresh production redeployment: saved configuration, share state and exact PNG hashes remained unchanged. Revocation then denied the gift JSON and shared asset with HTTP 404.
- Hosted Workflow execution, live Tripo generation/animation and large GLB streaming remain unverified. A working example deployment does not establish their success.

## Operations

Use Vercel function and Workflow logs for request/queue failures; use Neon for database usage and backups. `/api/health` checks the hosted database without leaking credentials. `/api/mode` identifies example/live mode and upload limits, not provider reliability.

Backups must include all PostgreSQL tables, including `asset_blobs`, snapshot tokens and quota history. Keep dumps private and test restoration in an isolated database with provider credentials disabled. A restore can restore old revocation and quota state; reconcile those before serving recipients. No backup/restore exercise is claimed here.

The Workflow SDK pins older serialization/ID dependencies; compatible patched `devalue` and `nanoid` versions are overridden in `package.json`. The remaining audit finding is in the SDK's optional Nest/SWC download toolchain (`http-cache-semantics`); no patched release was available when checked. The app does not invoke that downloader at runtime.
