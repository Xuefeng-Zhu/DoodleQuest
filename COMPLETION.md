# Completion and verification

Verified locally on 2026-09-30. This is a working vertical-slice prototype, not a deployed production service or a verified live Tripo submission.

## Works locally

- [x] Interactive scene-led landing page and immediately playable original example.
- [x] Explicit quest progression, shape-and-color bell sequence, gentle retry, opening gate, star collection/carrying, mailbox delivery, personal ending and replay.
- [x] Shared action handlers for scene clicking/tapping and keyboard-accessible DOM controls; proximity, prerequisites and duplicate guards.
- [x] JPEG/PNG selection, drag/drop, crop/rotate preview, server decoding/limits and separate private original/reference assets.
- [x] Persistent adult-owned drafts, resumable generation status, personalization during generation, rotatable hero, forward adjustment, procedural movement and explicit approval.
- [x] Same world in three palettes; complete preview; immutable published snapshots, copyable unlisted links, revocation and deletion.
- [x] Owner sessions, same-origin mutations, protected assets, creator access-code gate, persistent rate limits and generation quota that cannot be reset by deleting a project.
- [x] Separate durable worker: leases/fencing, task-ID resumption, uncertain-submit stop, safe backoff and download retries without generating again.
- [x] Model bounds/ground normalization, bundled Meshopt decoder, validation and resource budgets, low rendering mode, capped DPR, reduced motion and readable WebGL/model failures.
- [x] Durable local file deletion queue and access revocation. No provider-side deletion claim.
- [x] Local web+worker command, migration/seed commands, production commands, Docker/Compose configuration and complete environment example.

## Executed checks

| Check                       | Result and scope                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                  | 17 tests passed: 5 quest tests and 12 server/reliability/security tests.                                                  |
| `npm run typecheck`         | Passed.                                                                                                                   |
| `npm run build`             | Passed optimized Next.js production build.                                                                                |
| `npm run test:e2e`          | 8 Chromium tests passed. The mocked generation and reduced-motion/mobile cases were also rerun after final safeguards.    |
| `npm audit --omit=dev`      | 0 runtime dependency vulnerabilities reported at verification time.                                                       |
| Local production HTTP smoke | Built web process returned 200 for `/`, `/example` and `/api/mode`; mode was example. This was not a deployed HTTPS test. |

The eight browser tests cover full example/replay; keyboard completion; narrow mobile/reduced motion/pause; saved drafts, approval, complete preview, publication in a separate context, recipient write denial, snapshot isolation, revocation and deletion; mocked generation/refresh with one task; invalid uploads and failed model loading; mobile creator and origin/asset authorization; and full completion without WebGL. Unit tests include unknown/terminal provider statuses, idempotency, known-task resumption, asset retry, uncertain submission, lease fencing, quota retention and the documented Tripo v3 wire contract.

## Actual visual evidence

- `evidence/walkthrough.mp4` and `.webm`: **92.56 seconds**, 1440 × 1000, actual browser interaction recorded by Playwright. Silent recording, not a cinematic trailer. It shows the original procedural example, approval, note, full adventure and publication. Suggested narration is separate in `DEMO_SCRIPT.md`.
- `evidence/asset-board.html`: original drawing, front/rotated character views, island, puzzle, collected star and personalized ending.
- Desktop and 390 × 844 mobile screenshots include landing, creator, gameplay and ending. Screenshots were visually inspected; the app was also inspected in the Codex in-app browser.
- `evidence/browser-console.txt` and `walkthrough-console.txt` record console observations. Normal use produced a dependency-level `THREE.Clock` deprecation warning. Screenshot recording can produce a software-renderer `ReadPixels` stall warning. Deliberately broken-model and disabled-WebGL tests produce expected errors and verify readable recovery. No unexpected uncaught application exception was observed in successful flows.

## Measured budgets, not an FPS promise

| Sample measurement                                                                 | Triangles | Draw calls | DPR | Median frame interval |
| ---------------------------------------------------------------------------------- | --------: | ---------: | --: | --------------------: |
| Codex in-app browser, landing miniature, 120 frames, 1280 × 720 viewport           |    44,742 |        165 | 1.5 |               16.7 ms |
| Chromium SwiftShader software rendering, example, 120 frames, 1440 × 1000 viewport |    44,910 |        168 |   1 |               59.1 ms |

Both observed sample scenes are under the 150,000-triangle / 250-draw-call scene budgets. These are short local samples, not a cross-device frame-rate guarantee. Software rendering is not a physical-device benchmark. Real generated models and physical mobile hardware remain unmeasured. Raw measurements are in the two `evidence/*metrics.json` files.

The original PNG is 43,744 bytes. The test-only mock GLB is 1,276 bytes / 8 triangles; its size is not representative of Tripo output. No real generated GLB is bundled. Server model limits include 25 MB file size, 100,000 triangles, 64 MB decoded buffers, 64 primitives, 512 nodes, 64 materials, 16 textures, 4096 pixels per texture side and 16 million total texture pixels. A requested 20,000-face provider option does not replace output validation.

## Live versus example versus mocked

| Item                                                                                                     | Evidence level                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pip drawing and toy-like hero                                                                            | Original repository assets. Hero is procedural, **not Tripo-generated**.                                               |
| Quest, personalization, SQLite persistence and share lifecycle                                           | Real local application behavior, tested in browser.                                                                    |
| Tripo upload, image-to-model, task retrieval and safe worker processing                                  | Real server adapter implemented from current official v3 documentation; automated network responses explicitly mocked. |
| Successful provider generation, charge count, provider CDN output, generated-model browser compatibility | **Not run**: no Tripo credentials were available. Follow the exact README smoke-test steps.                            |
| Optional sketch enhancement                                                                              | Not implemented; direct image-to-model is the supported path.                                                          |

Arbitrary uploads in example mode do not silently receive Pip. Failed live generation is never replaced by a sample. Recipient viewing and gameplay do not call paid generation APIs.

## Remaining limitations / not run

- [ ] Live Tripo smoke test and actual generated-model provenance/performance evidence. The proposed Tripo event track remains conditional on this evidence.
- [ ] Docker image build, persistent-volume deployment, HTTPS/reverse-proxy operation, backup/restore and production failure testing. Configuration is for one persistent node, **not ephemeral serverless**.
- [ ] Safari, Firefox, physical phone/touch hardware, screen-reader audit and physical sound playback. Keyboard and emulated narrow/touch-compatible viewport behavior were tested in Chromium.
- [ ] A narrated recording and event submission. The supplied real recording is silent; no entry has been submitted.
- Owner-cookie loss has no account recovery. An unlisted link is accessible to anyone possessing it. Revocation cannot retract previously downloaded copies.
- Target play time is approximately 2–3 minutes by design, not validated with children or guaranteed for every player. No formal child-privacy compliance or legal certification is claimed.

The game-development guidance influenced the separation of deterministic quest rules, input handlers, camera, waypoint movement and character rendering. The frontend/playtest guidance informed the scene-led presentation and actual desktop/mobile browser evidence.
