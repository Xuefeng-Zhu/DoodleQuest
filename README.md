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

The island celebrates earned progress: each correct bell lights a ribbon section, collecting the star opens the garden flowers, and delivery warms the island with a golden rim and little stars. Rewards persist until replay; pause and reduced-motion settings apply without changing the quest.

Delivery also brings a sealed envelope. Choose **Open your letter** to read the creator’s unchanged note on warm stationery, then fold it for rereading or play again. The letter supports keyboard/touch controls, reduced motion, long-message scrolling and the creator’s original-drawing permission. No additional generation or credentials are needed.

Creators can add **A little saying (optional)**: up to 60 characters of a shared phrase, tiny memory or inside joke. The same paper tag appears at the opening, travels above the collected star, and is tucked into the final letter. It is visible from the start, not part of the surprise message. Leave it blank to omit it. Saved drafts and immutable gift snapshots preserve the exact words; older gifts remain without a tag. This adds no paid generation.

**Tiny wonders off the path:** tap the sleepy flower to open it, tickle the little cloud for a puff, or invite the butterfly to keep the hero company briefly. They are optional, repeatable moments, not collectibles or quest requirements. The compact **Little wonders** control provides the same actions for keyboard users. Effects settle on their own, freeze while paused, respect reduced motion and reset on replay. The no-WebGL alternative describes these moments in words. All three are original procedural geometry; no credentials or generation calls are needed.

**A melody that comes home:** opt into **Gentle sounds** at the opening or in settings. The circle, triangle and star bells play three notes; collecting the star gives a higher echo, and first opening the letter brings those notes back in a short, resolving music-box phrase. **Play the melody** lets you listen again and explicitly enables sound; **Stop melody**, mute, pause, folding, replay and leaving the page stop it. A folded letter does not automatically repeat the tune. Sound is off by default and never required. Music is synthesized locally from an original fixed score—no audio download, microphone access, AI provider, credentials or looped background music.

**Wrapping the gift becomes a moment:** in **Preview & share**, choose **Wrap this gift**. Review the recipient, unchanged note and original-drawing permission, then choose **Seal & publish gift**. The paper parcel takes its ribbon and heart seal only after the server confirms a saved snapshot. Copy its link or open it; nothing is sent automatically. Cancel before sealing without publishing. Reduced motion settles the parcel immediately, and the long note remains scrollable. A lost response offers **Check saved gift links**, never an automatic second publication. Existing version links, revocation and deletion remain in the workshop. This adds no generation cost or credentials.

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

The recipient opening now includes a permission-aware **drawing meets world** reveal. See `REVEAL.md` for behavior, tests and the new short actual-product recording. `npm run demo:reveal` records only the bundled recipient example and performs no creator or generation writes.

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
