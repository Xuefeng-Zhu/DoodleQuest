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
- `domain/celebration.ts`, `game/IslandCelebration.tsx`: earned island feedback derived from quest state, never a second progression system. Three ribbon sections light in order, garden buds open after collection and stay open after delivery, and the ending adds warm light, a golden rim and small stars. Bounded ref-driven transitions freeze on pause/hidden tabs; reduced motion settles immediately. Replay and wrong-bell resets do not leave stale effects. No postprocessing or additional light sources.
- `domain/wonders.ts`, `game/TinyWonders.tsx`, `WonderControls.tsx`: three optional authored flower/cloud/butterfly responses, independent of quest state. Scene raycasts and accessible DOM controls call the same guarded store action. Repeated input while active is ignored, not stacked or extended. The DOM-owned `useWonderClock` keeps durations working in the no-WebGL view, freezes on pause/hidden tabs and writes only activation/settling to Zustand. Mutable time refs drive geometry; reduced motion shows static responses. The butterfly and hero share one waypoint-position sampler. Completion, replay and Game unmount clear effects. No persistence, new provider calls, extra lights or rewards.
- `game/World.tsx`: Canvas, camera, authored island and destinations. `Hero.tsx`: independent bounding-box normalization, ground placement, creator forward rotation and outer procedural movement wrapper. Meshopt is bundled; unsupported required compression is rejected.
- `Game.tsx`: DOM controls, objective, pause, sound and ending. Zustand holds low-frequency interface/progression state. Movement uses an animation ref; arrival commits one transition. No broad React updates every frame.
- `domain/melody.ts`, `game/MelodyPlayer.ts`, `game/useMelody.ts`: a fixed three-note bell motif, higher collection echo and resolving letter phrase. Audio is derived from accepted quest transitions, not every attempted click. One lazy, user-gesture-resumed Web Audio context schedules at most 14 quiet oscillators for one cue; a new cue replaces the old one. A revision fence cancels late async resume results, a bounded resume deadline reports unavailable audio, and natural endings/disposal disconnect nodes. Mute, pause, hidden tabs, page exit, folding and replay cancel both sounding and scheduled notes, without automatic resumption. Unmount closes the context. First letter opening is once per adventure; explicit replay is opt-in. The UI changes only at cue boundaries. No persisted schema, generated music, external samples or paid API calls.

Audio lifecycle choices follow the browser's [user-gesture and user-control guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) and [AudioContext resume contract](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume). Actual speaker audibility and browser-graph output are distinct verification layers.
- `domain/letter.ts`, `GiftLetter.tsx`: a sealed → opening → reading presentation mounted only after delivery. A bounded opening clock freezes on pause and skips motion when requested. Opening/folding does not modify quest progress or snapshots. The full message is rendered as plain text only in the reading view, with a native keyboard-scrollable sheet for long notes. This is a presentation reveal, not encryption: the authorized gift payload already contains the note. The optional drawing is still permission-gated and its ending image mounts only after opening the keepsake details.
- `domain/reveal.ts`, `GiftReveal.tsx`, `useGiftReveal.ts`, `CameraRig.tsx`: permission-aware opening presentation, independent of quest progression. The same canvas and loaded hero move from comparison to island. Drawing-disabled gifts never mount the original; reduced motion skips camera travel. See `REVEAL.md`.
- `Creator.tsx`: progressive creation, saved personalization, read-only generation polling and explicit approval. A model must load before approval enables. A preview failure never starts generation.
- `GiftWrapping.tsx`: a native modal review → saving → publishing → sealed flow around the existing snapshot endpoint. No extra input, schema or asset fetch is required. A synchronous in-flight guard prevents repeated activation in the mounted flow. Save/publish has a 20-second client deadline; status text reports real request stages. Ribbon/seal motion only follows a confirmed response, and never gates copying. The publish response now includes its existing gift ID so the owner can retain the confirmed link without a second request. A failed save cannot publish. An unconfirmed publish stops for explicit read-only reconciliation: reload owner shares, find a new active version, and read its immutable config before showing a receipt. Checking has a 15-second deadline; it never POSTs or automatically retries publication. This is not server-side publish idempotency across separate tabs or deliberate new submissions.
- Wrapping uses the browser's [native modal top layer and inert background](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal), explicit heading focus, close-before-unmount focus return, scrollable long notes and CSS reduced motion. Clipboard success is shown only after [writeText resolves](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText); failure selects the read-only link for manual copying. The dialog sends no messages to recipients and cannot revoke a saved gift merely by closing.
- `GiftConfigSchema.dedication`, `DedicationTag.tsx`: one optional, trimmed, at-most-60-character plain-text saying. Draft and gift reads apply schema defaults in memory, so legacy JSON remains untouched and missing values remain empty. Publishing copies the saying into the immutable JSON snapshot; no migration or new gameplay state is needed. The same tag appears at the opening, in a Drei `Html` anchor on the character's procedural wrapper while `hasStar`, then in the letter. No per-frame React updates or extra geometry. The game status announces the saying; the moving copy is hidden from the accessibility tree to avoid duplicate reading. The no-WebGL path includes a visible DOM tag. Empty values render nothing.
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
