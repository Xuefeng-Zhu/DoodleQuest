# DoodleQuest

**Your drawing deserves a world.** An adult-created, family-oriented browser prototype: a drawing becomes a 3D interpretation, then the hero of a tiny playable gift.

## Run locally

Node 24 LTS and npm recommended. Exact dependencies are in `package-lock.json`.

```sh
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000** (use the exact configured `APP_ORIGIN`). `dev` starts Next.js and the separate durable Node worker. `/example` needs no credentials. `/create` persists drafts in this browser's owner session. Keep its cookies: there is no account recovery. No child name, age, photo, school, or location is required.

## Live, example, and mock modes

| Mode             | Behavior                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Example, default | Original repository drawing + authored procedural Pip. Complete quest, saving, approval, sharing, revocation, deletion. **Not Tripo-generated.** Arbitrary uploads cannot masquerade as generated Pip. |
| Live             | Server-side `TRIPO_API_KEY` + `CREATOR_ACCESS_CODE`. Documented v3 upload → image-to-model → polling → validated protected GLB. Live smoke test **not run**: credentials were not available.           |
| Mock             | Explicit `E2E_MOCK_PROVIDER=1`, nonproduction only. Automated tests use a labeled octahedron GLB and deterministic responses. Never live evidence; production rejects this flag.                       |

## Credentials and generation

Set `TRIPO_API_KEY` only on the server, never in a `NEXT_PUBLIC_` variable. Set a strong `CREATOR_ACCESS_CODE`. Every paid creation requires an unlocked owner session, explicit drawing-transfer consent and a quota reservation. The default installation-wide **and** per-session quota is 10 attempts, including failed/uncertain attempts. Project deletion does not reset it; the global cap prevents bypass through new cookies.

`TRIPO_MODEL=v3.1-20260211` is a configurable documented H-series model. Requests specify 20,000 faces, standard textures, no sketch enhancement or rigging, and documented geometry/meshopt compression. Validate actual outputs independently of requested options. Review current provider pricing before live use.

Browser refresh cannot resubmit. Worker restarts resume known task IDs. Provider success and local asset success are separate statuses. Asset retries retrieve fresh output URLs without regeneration. Submission timeouts or interrupted submits without a saved task ID become **uncertain** and stop. No client idempotency lookup capability is assumed: check the Tripo console before explicitly authorizing another paid attempt. Percentages are only provider-reported.

`TRIPO_ASSET_HOSTS` is an exact server-configured output-host allowlist; default `cdn.tripo3d.ai` matches the official response example. If a live response uses another host, review it before extending the list. Never accept a caller-supplied host, wildcard, private address or unrestricted proxy.

To queue and cache one paid real sample:

```sh
npm run sample:generate -- --confirm-paid
npm run worker
```

The CLI caches protected output, not a distributable sample, and its job is inspectable locally in SQLite. For normal visual approval/sharing use the creator UI instead. Review redistribution permissions and update provenance before bundling a real model. None is currently distributed.

## Production: one persistent node, not ephemeral serverless

```sh
npm run build
npm run db:migrate
npm run start     # web process
npm run worker    # separate process, same DATA_DIR
```

Or `docker compose up --build -d`. Configure `.env` with the final HTTPS `APP_ORIGIN`, credentials and quota. Terminate TLS at a reverse proxy; production owner cookies are Secure. Compose binds web to loopback for the proxy. Both processes **must share the persistent `/data` volume**, local SQLite locking, and write permission for UID 1000. Do not put SQLite on a network filesystem, scale to multiple nodes, or use ephemeral serverless hosting. Back up SQLite and assets together using a consistent snapshot. Never expose `/data` as static files.

Docker and deployed HTTPS operation have not been exercised. Local verification is recorded in `COMPLETION.md`.

## Privacy and controls

Gift links are **unlisted, not fully private**. Anyone with a link can view its immutable snapshot. Later edits do not change it. Revocation denies future requests but cannot erase already downloaded copies or an already open browser. Recipient routes never invoke paid APIs. Each asset request verifies ownership or an active gift token referencing that exact asset.

JPEG/PNG uploads are bounded to 10 MB, decoded, dimensions checked, metadata stripped, and stored privately. Original and crop/rotation input are separate assets. Generated models must be self-contained validated GLB2. Names/messages render as text. Mutations enforce same-origin and HTTP-only SameSite owner sessions; production cookies are Secure. Persistent rate limits and quotas gate paid creation.

Deleting a project revokes access and removes references and local originals/models. A durable file-delete queue retries filesystem failures. Minimal anonymous quota counts survive deletion, not drawings/names/messages/share tokens. Deletion from Tripo is **not promised**. This prototype does not claim formal child-privacy compliance or legal certification.

## Verification

```sh
npm test
npm run typecheck
npm run test:e2e
npm run build
```

Browser tests use temporary storage, localhost:3107, and an explicitly mocked provider. Install Chromium if needed (`npx playwright install chromium`). Screenshots, actual browser videos and console observations are in `evidence/` and the test report. DOM controls support keyboard, mouse and touch; reduced motion, pause, low rendering mode and readable WebGL failure states are included.

The delivered `evidence/walkthrough.mp4` is a 92.56-second actual browser recording (silent, procedural example clearly labeled). Open `evidence/asset-board.html` for the visual board. To rerecord against the running local app:

```sh
npm run demo:record
ffmpeg -y -i evidence/walkthrough.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart evidence/walkthrough.mp4
```

Recording creates a fictional example draft and local share in the selected instance. `DEMO_BASE_URL` may override the default localhost URL; do not point this evidence script at a production service without intending those writes.

See `ARCHITECTURE.md`, `ASSET_PROVENANCE.md`, `COMPLETION.md`, `SUBMISSION.md`, and `DEMO_SCRIPT.md`.

## Live smoke test — not run

1. Configure key, code, model, origin and quota. Start web and worker. Use only the repository drawing for this first test, not a child's private image.
2. Upload its PNG using **Choose a drawing** (the quick sample button deliberately selects the procedural hero). Consent, unlock and submit once. Record the task ID, never the key.
3. Refresh and restart the worker while polling. Verify the same ID and exactly one provider submission/charge.
4. Verify provider success, reviewed CDN, copied GLB budget, browser loading, forward adjustment, approval and gameplay using that actual model. Local failure must not regenerate.
5. Publish, open a separate recipient context, complete, capture actual provenance/gameplay, revoke, and delete.
6. Update evidence only after these checks pass. Mock results do not substitute.

## Official sources reviewed, 2026-09-30

- [Requested generation entry](https://platform.tripo3d.ai/docs/generation) and [image-generation entry](https://platform.tripo3d.ai/docs/generate-image); followed their v3 migration navigation.
- [Migration](https://developers.tripo3d.ai/en/docs/migration-v2-to-v3), [image-to-model](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard), [upload](https://developers.tripo3d.ai/en/docs/files), [task retrieval](https://developers.tripo3d.ai/en/docs/task-query), [rate limits](https://developers.tripo3d.ai/en/docs/rate-limits).
- [Tripothon S1](https://developers.tripo3d.ai/en/events/tripothon-s1).
