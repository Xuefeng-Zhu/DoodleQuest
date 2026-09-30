# Architecture

One Next.js application and one small Node worker share a persistent local SQLite database and private asset directory. No Redis or service framework.

```text
Adult browser → owner/CSRF/rate/quota checks → SQLite draft
  upload → Sharp → original + normalized input → protected storage
  generation → durable job → worker lease → Tripo upload
    → submit once → persist task ID → poll → download → validate → approval
  approved draft → immutable snapshot → random unlisted gift link
Recipient → read-only snapshot + authorized assets → authored R3F adventure
```

## Boundaries

- `domain/quest.ts`: pure explicit progression, prerequisites, proximity and duplicate guards. Sequence: circle → triangle → star. Generated geometry never controls gameplay.
- `game/World.tsx`: Canvas, camera, authored island and destinations. `Hero.tsx`: independent bounding-box normalization, ground placement, creator forward rotation and outer procedural movement wrapper. Meshopt is bundled; unsupported required compression is rejected.
- `Game.tsx`: DOM controls, objective, pause, sound and ending. Zustand holds low-frequency interface/progression state. Movement uses an animation ref; arrival commits one transition. No broad React updates every frame.
- `Creator.tsx`: progressive creation, saved personalization, read-only generation polling and explicit approval. A model must load before approval enables. A preview failure never starts generation.
- `server/schema.ts`: Drizzle entities CreatorSession, Project, Asset, GenerationJob, PublishedGift. Explicit idempotent migration in `db.ts`; WAL and immediate transactions protect quota, job creation and lease claims. Small ancillary tables store rate limits, lifetime quota counts and pending file deletion.
- `TripoProvider`, `AssetStorage`, `GenerationRepository`: small interfaces, not a multi-provider framework.

## Reliability

`pending → uploading → submitting → queued/generating → downloading → ready`.

Known task IDs are always polled, never resubmitted. `asset_retry` means provider success but local delivery/validation failure; only safe steps repeat. `failed` and `uncertain` require an explicit new attempt. Actual provider status remains separate from normalized application status.

Claims have 120-second leases and fencing tokens. Individual network timeouts are shorter. Marking `submitting` before the outbound request covers the response/persistence crash window: without a saved ID, recovery stops as uncertain. No unsupported idempotency-reconciliation endpoint is assumed. Safe retries use exponential backoff (capped at five minutes) and provider rate-limit headers.

## Ownership and storage

Owner cookie: 256 random bits, HTTP-only, SameSite Strict, Secure in production; only its SHA-256 digest is persisted. Every mutation checks ownership and exact origin. Gift tokens are independently random. Public asset access requires an active snapshot referencing that exact ID. Paths are server-generated, never caller-supplied.

Immutable JSON snapshots retain config and asset references. Replacing a draft drawing/model never overwrites a shared version. Deletion atomically removes access and queues local files; a durable garbage collector retries failed unlinks. Anonymous quota counts remain to prevent delete-and-regenerate abuse.

## Rendering and asset budgets

- Upload ≤10 MB, 64–8000 pixels per side, ≤24 million pixels. Normalized input ≤1536; square crop 1024.
- GLB ≤25 MB, ≤100,000 triangles, ≤64 MB decoded buffers and ≤64 primitives; self-contained textures ≤4096 per side and ≤16 million pixels in total. Additional caps: 512 nodes, 64 materials and 16 textures. Tripo request targets 20,000 faces, but actual output is checked separately.
- Scene budget ≤150,000 triangles / ≤250 draw calls. Actual measurements are in `COMPLETION.md`, not an assumed frame-rate claim.
- DPR ≤1.5; low mode 1. One directional shadow map, cached contact shadow, no postprocessing. Procedural wrapper needs no skeleton, complex physics or generated collision mesh.

Deployment is **single-node persistent local disk**, not ephemeral serverless. No account recovery, multi-node coordination, formal legal certification, or provider-side deletion guarantee is claimed.
