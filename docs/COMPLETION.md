# Completion and verification

This working prototype has local application and live Tripo image-to-model evidence. It has no verified production deployment or submitted event entry. Dated sections retain their original test scopes; historical “not run” or “unverified” statements describe those earlier checks and do not override the reconciliation below.

## Vercel and Neon migration — 2026-10-03

The application now uses async PostgreSQL persistence for records and private asset bytes, with Vercel Workflows for durable generation/motion jobs. Local development uses embedded PostgreSQL when no connection URL is configured; Vercel fails closed without a database URL. Existing private SQLite data was preserved and was not imported or published.

Verified locally on this migration:

- `npm test`: **147 tests across 16 files passed**. Coverage includes PostgreSQL rollback, concurrent quota and storage limits, private asset streaming/revocation, atomic drawing replacement, generation uncertainty and Workflow dispatch recovery.
- TypeScript and the production build passed. The build compiled one workflow and its registered steps. All **11 function traces** were checked after rebuilding: no private `data/`, `evidence/` or `.env` files were included.
- The native `pg` driver passed an isolated **PostgreSQL 17.11** smoke test using separate backend connections: persisted gifts and exact PNG/GLB bytes, concurrent last-slot quota/storage reservations, nested rollback, pool reopen and container restart. The temporary container and its anonymous volume were removed afterward.
- The first full Chromium run passed **41 of 42** cases. A development-server configuration reload interrupted the long sharing/revocation case; that case then **passed its isolated rerun in 1.4 minutes** after configuration stabilized. All 42 distinct cases passed across those runs. Mocked generation refresh recovery and the full mocked rigging/shared-gift pipeline passed through the compiled local Workflow runtime.

Hosted Neon connectivity, hosted Workflow execution, Vercel HTTPS and hosted streaming remain unverified. Vercel login was verified on the Hobby plan; Neon provisioning is awaiting the owner's agreement approval in Vercel Marketplace. No Vercel project or Neon database was created, no paid tier selected, and no Tripo credentials were transferred or provider calls made. Initial hosted configuration is example mode with `GENERATION_QUOTA=0`.

## Tripothon S1 evidence reconciliation — 2026-10-03

The local verification records contain **two distinct successful live Tripo image-to-model jobs**, both using model version `v3.1-20260211`. The stored GLB hashes match those records. Submission preparation reran `npm test`: **96 tests across 11 files passed in 2.43 seconds** on the source based on `origin/main` at `72dda95`. Earlier Chromium and build results below retain their original dates and were not rerun as part of this documentation reconciliation.

| Live result                                            | Validated GLB                   | Recorded provider credits | Verified local use                                                                                                  |
| ------------------------------------------------------ | ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Repository Pip drawing interpreted by Tripo            | 445,404 bytes; 19,202 triangles | 30                        | Upload, browser refresh and worker restart resuming the same task, approval, bell puzzle, star, mailbox and letter. |
| Generic illustrated Mom & Dad interpreted as one model | 793,396 bytes; 19,796 triangles | 30                        | Upload, approval, personalization, wrapping, link copy and complete adventure in a separate recipient browser.      |

The first run's record does not claim publication. The second run supplied the model for the corrected child-to-parents gift: recipient **Mom & Dad**, sender **Your little artist**, dedication **You make my world brighter**. That correction reused the approved model with **zero additional generation credits**; the records report two total generation reservations. Both live-flow records report zero console errors. The existing `THREE.Clock` deprecation warning remains. No new paid provider call was made while preparing this packet.

The current [walkthrough](../evidence/tripothon-s1/walkthrough.mp4) is **87.333333 seconds, 1440 × 960, H.264 at 24 fps, silent**. It assembles actual local browser screenshots sampled at approximately 5 fps; it is not continuous 24 fps capture. Original live generation and approval footage is reused for the identical Mom & Dad model, followed by newly captured corrected personalization, wrapping and recipient gameplay. Tool-idle gaps were removed, generation waits are visibly accelerated 8×, and the final image is held briefly. The **64.65-second** number in the corrected source record describes its new capture timeline, not the finished video's duration. The source MP4 passed a full decode with zero errors.

The [asset board](../evidence/tripothon-s1/asset-board.html), its 2400 × 3588 [PNG export](../evidence/tripothon-s1/asset-board.png), and [sanitized evidence manifest](../evidence/tripothon-s1/verification.json) form the local submission packet. The shareable video masks local gift links in three bounded regions. All 538 source frames were scanned for URL and credential patterns; all 344 encoded frames spanning the affected interval and nine boundary frames passed the redaction checks. Key masked scenes and all six selected stills were visually inspected. The redacted video also passed a full decode, and its stored hash matches the manifest. This is a local media review, not a guarantee about every possible OCR miss.

Raw verification records, task identifiers, unlisted gift tokens, runtime assets and credentials remain in ignored local data. The repository was verified private during preparation; judge access and event submission remain unresolved.

Live Tripo **rigging and animation** remain unverified; their existing tests use an authored skinned fixture. No claim is made for hosted HTTPS, Docker deployment, backup/restore, physical phone/touch/audio performance, Safari/Firefox or a screen-reader audit. The live records also do not establish revocation/deletion acceptance with a live-generated asset. Historical Chromium coverage below includes those lifecycle behaviors with the stated procedural or mock fixtures.

## Hero movement and reactions — 2026-10-02

The hero plays idle and walking clips, crossfades between them, and reacts once when the bell gate opens, the star is collected, and the gift is delivered. Travel can interrupt a reaction. Per-instance skeletons and mixers prevent cached models from sharing bone state. Pause and hidden tabs freeze playback, reduced motion settles the pose without delayed reactions, and replay resets the motion state. Pip has authored limb/head movement; it remains procedural. Generated heroes use the selected fallback motion when a matching clip is unavailable.

The workshop has local **Idle / Walk / Celebrate** previews and a separate **Bring my hero to life** action with explicit credit consent. Tripo compatibility, rigging, and retarget stages are durable and retain their task IDs. Unknown submissions stop as uncertain. Explicit retries retain completed earlier stages. Transient delivery failures retry the same output; permanently invalid, unsupported or oversized animation stops without locking the draft. The original hero remains available until valid replacement, which requires approval again. Existing gift versions retain their old asset. A confirmed POST receipt survives failed later reads, and unconfirmed responses have a read-only status recovery path.

**96 unit/server tests, all 42 Chromium tests, TypeScript, production build, and `git diff --check` passed.** The browser suite ran in two groups: 10 focused tests passed in 4.2 minutes, and the remaining 32 regressions passed in 9.6 minutes. The focused tests cover the existing creator/share lifecycle and three new motion cases. They exercise the actual local mock worker, consent, a deliberately lost successful POST response, refresh recovery to one job, genuine skeletal deformation, clip previews, the same protected animated asset in a recipient context, recipient mutation denial, walking, three one-shot reactions, pause, replay, mobile reduced motion and failed status reads. The confirmed-receipt/read-failure case uses explicit browser route fixtures. Hidden-tab checks inject visibility state; they do not establish operating-system background behavior.

The original animated test character has **1,860 triangles, six bones, three clips, and 343,116 bytes**. glTF validation reports zero errors and warnings. A CPU mixer check also verifies real vertex deformation, not just a rigid model moving around. It is an authored fixture, not Tripo-generated or Tripo-rigged output. No paid provider call was made.

Visually reviewed evidence includes `hero-motion-preview-idle.png`, `hero-motion-preview-cheer.png`, `hero-motion-gate-cheer.png`, and the mobile procedural motion captures. The existing `THREE.Clock` deprecation remains; missing-model, lost-response and failed-read errors are intentionally exercised. Live Tripo generation/rigging, provider clip names and visual quality, physical touch/GPU performance, Safari/Firefox, and deployed hosting remain unverified. The isolated local production example on port 3006 returned HTTP 200 with paid generation disabled.

## Wrapping the gift becomes a moment — 2026-10-01

- **Preview & share → Wrap this gift** opens a quiet paper-and-ribbon review. The recipient tag, unchanged note, optional saying and original-drawing permission remain visible. Cancel or Escape before sealing publishes nothing. The native modal makes the workshop inert and returns focus when closed.
- **Seal & publish gift** first saves the latest words, then creates the existing immutable snapshot. Only a confirmed response ties the ribbon and adds the heart seal. The parcel follows the selected world's palette. A confirmed link can be copied or opened immediately; the short animation never blocks it. Nothing is sent to a recipient automatically.
- A synchronous in-flight guard prevents repeated activation within the wrapping flow. Saving/publishing has a 20-second client deadline; checking has a 15-second deadline. Failed saves cannot publish. An unconfirmed publish offers an explicit read-only check of owner links and the actual published snapshot, without a second POST. This is not cross-tab/server-side publishing idempotency. Existing saved version links, revocation, deletion and ownership checks remain intact.
- Keyboard/touch controls, scrollable long notes, reduced motion, long-name wrapping and readable clipboard failure are implemented. Denied copying selects the read-only link for manual copying. No new dependencies, migrations, image/model fetches in the wrapping dialog, 3D geometry, provider calls or paid generation were added. Game UI guidance kept the ceremony brief, optional and separate from gameplay.

**57 unit tests, TypeScript, production build and `git diff --check` passed. All 11 selected Chromium regressions passed in a 4.9-minute run.** This included the complete example, keyboard/mobile adventure, real local creator approval/preview, recipient-context isolation, immutable sharing, revocation/deletion, explicitly mocked generation and upload/model errors, plus four new wrapping tests. After final copy-text and test refinements, **all four wrapping tests passed again in 56.0 seconds**. The full 34-case browser suite was not rerun for this update. No live Tripo calls were made.

The wrapping tests use authenticated procedural-sample API fixtures to focus on the ceremony; the separate creator regression exercises actual UI approval. Tests verify cancellation without a POST, no seal during a held publication, repeated-input protection, actual Chromium clipboard write/read, persisted links across reload, recipient write denial, revocation, a deliberately lost response after a real local commit, recovery without republishing, immutable receipt names after draft changes, a deliberately failed save, actual emulated touch at 320px, native keyboard scrolling through a 1,200-character note, reduced-motion settlement, and injected clipboard denial. Browser timers for the two request deadlines were not separately fault-tested.

Initial tests found and fixed an actual focus-return bug: closing only during unmount was too late; the modal now closes while connected. Subsequent test refinements allow native focus to leave for browser chrome while verifying workshop controls remain inert, and wait for the revocation UI confirmation before checking denied access. No product authorization or snapshot assertions were removed.

Actual evidence: visually inspected `evidence/wrapping-review-desktop.png`, `wrapping-sealed-desktop.png`, the 390px standard-name receipt and 320px maximum-length note/receipt/manual-copy captures. The decorative parcel tag truncates unusually long names, while the accessible heading and note retain their complete values. `evidence/wrapping-walkthrough.mp4` is an **actual 29.72-second silent browser recording, 800 × 554, 326,264 bytes**, from the successful keyboard/clipboard/version-controls test. It includes a mobile resize, not physical-device footage. The asset board now includes the wrapping receipt. These are local test gifts and original CSS art, not live Tripo assets or a hosted delivery.

The final wrapping log has no uncaught application exception. Existing `THREE.Clock` deprecation and software-renderer `ReadPixels` warnings remain; the lost-response and failed-save tests intentionally log a network failure and HTTP 503. The broader regression intentionally exercises a broken model. Safari/Firefox, physical touch hardware, real screen readers, live Tripo and deployment remain unverified. The local `/create` route returned HTTP 200 at handoff.

## A melody that comes home — 2026-10-01

- The three bell shapes now share an original C–E–G motif. Collecting the star gives a higher echo, and the first **Open your letter** gesture returns those notes in a short resolving phrase. Audio starts at the opening gesture, not at a promised animation frame; on a slow renderer the letter may unfold after the phrase finishes.
- Sound is off by default. **Gentle sounds** at the opening/settings changes the preference without creating an audio context. The letter's **Play the melody** explicitly enables sound; **Stop melody** stops it. Folding and reopening do not automatically repeat it; replay resets that once-only behavior and retains the sound preference.
- Accepted bell actions, including gentle wrong-sequence retries, sound only at the bell station. Rejected, remote, moving, paused and duplicate interactions do not produce cues. Mute, pause, hidden tabs, page exit, folding, replay and unmount cancel current and scheduled notes. Pending audio resumes cannot resurrect cancelled cues. No automatic audio resume occurs when the page becomes visible again.
- One lazy Web Audio context uses at most 14 oscillator voices for a cue, then disconnects them. Unmount closes the context. Audio failure leaves a readable message and the complete playable/text adventure. No schema changes, additional dependencies, audio downloads, microphone access, provider calls or paid generation were added. Game UI guidance kept listening optional and the letter focused on its message.

**55 unit tests, TypeScript, production build and `git diff --check` passed. All 16 focused Chromium browser tests passed in one 6.7-minute run**, covering melody, letter, traveling saying, drawing reveal and no-WebGL fallback. The complete 30-case browser suite was not rerun for this update. New tests cover real browser oscillator scheduling and non-silent output, no context while muted, once-only opening, explicit listening/stopping, pause/mute/fold/replay/exit cancellation, 320px actual emulated touch, reduced motion and injected audio/WebGL failure. Hidden-tab cancellation uses an injected visibility condition; it is not physical OS background testing. Unit tests use explicit fake audio nodes; the normal browser audio test uses the native Web Audio graph, not a fake implementation.

Earlier browser attempts exposed test timing issues: the audio ended while software rendering delayed the envelope, and a waypoint exceeded a 15-second test wait. The final native-audio case measures the signal immediately, uses the product's low-quality setting and a 30-second movement allowance, and preserves the full quest. Visual review also caught a screenshot taken during the paper's fade-in; the final capture waits for opacity and rendered frames.

Actual evidence: `evidence/melody-*.png` includes visually inspected desktop and 320px opening/letter views and the readable failure state. The mobile listening view is scrolled to its audio controls; the unchanged message remains above. `melody-walkthrough.mp4` is an **actual 28.96-second silent browser recording, 800 × 554, 659,414 bytes**. The separate `melody-browser-audio.webm` captures only the app's native audio graph (69,534 bytes), with a **4.32-second MP3 copy, 104,877 bytes**. The measured peak was **0.07450**, below digital clipping, with expected C5/E5/G5/E5/D5/C5 pitches and final C4 support; raw measurements are in `melody-audio-measurement.json`. This verifies generated browser output, **not physical speaker/headphone audibility**. Audio is not muxed into the silent screen recording.

No unexpected application exception occurred in normal melody play. The existing `THREE.Clock` deprecation remains; deliberate WebGL failure logs its handled renderer error. Pip remains procedural, not Tripo-generated. No new mesh geometry was added and no new frame-rate claim is made. Safari/Firefox, physical audio/touch devices, real screen readers, live Tripo and deployed hosting remain unverified.

## Tiny wonders off the path — 2026-10-01

- A sleepy flower opens when tapped, a friendly cloud releases a small puff, and a butterfly briefly accompanies the hero before returning to its leaf. These are optional, repeatable authored moments: no collectibles, counter, rewards or extra quest stages.
- Actual scene clicks/taps and the keyboard-accessible **Little wonders** disclosure use the same guarded action handler. Choices collapse after activation, focus returns to the toggle, and Escape closes the panel. A separate polite announcement describes each response without replacing the quest objective.
- Effects are independent and bounded. Repeated input cannot stack or extend an active effect. Pause and hidden tabs freeze their clocks; reduced motion uses static responses. Completion, replay and unmount clear effects. The butterfly samples the same waypoint position as the hero, independently of generated geometry. Per-frame animation uses refs, not React state updates.
- The no-WebGL view offers the same actions as explicitly textual moments. No dependencies, provider calls, credentials, persistence, snapshot changes, new lights or postprocessing were added. Game UI guidance kept the optional controls collapsed and the scene prominent.

**46 unit tests, TypeScript, production build and `git diff --check` passed.** All four new Chromium browser tests passed: actual scene clicks and touch, keyboard controls/focus, automatic settling, duplicate guards in unit tests, following/return, pixel-identical paused canvas, replay, 320px low-quality/reduced-motion play, readable no-WebGL fallback and completion through the unchanged quest. The full 27-case regression run finished with **26 passes and one overall 120-second creator/share timeout** in 15.8 minutes. That case then **passed separately in 2.6 minutes** with unchanged assertions and a 240-second limit (`npm run test:e2e -- --last-failed --timeout=240000`). All 27 distinct browser cases passed across these runs; this was not a single clean 27-test run. The rerun verified persisted drafts, approval, full preview, separate recipient context, write denial, immutable snapshots, revocation and deletion.

Initial test corrections were a floating-point assertion tolerance and more time for the software-rendered 120-frame sample. The final rendering test uses a 1024 × 768 viewport, preserves the full sample and budget assertions, and avoids duplicating a full quest already covered in the other tests. No gameplay prerequisite was bypassed.

Actual evidence: visually inspected desktop and 320px mobile screenshots in `evidence/wonders-*.png`, plus the updated ending. `evidence/wonders-walkthrough.mp4` is a **53.92-second silent browser recording, 800 × 554, 867,565 bytes**, showing all three scene interactions, the butterfly traveling, the bell/star/mailbox quest, letter and replay. The asset board includes the flower, butterfly and cloud. Pip and the new scenery are explicitly procedural, not Tripo-generated.

Measured geometry stayed within the **150,000-triangle / 250-draw-call** budgets. With all three wonders active and settings paused, the 120-frame SwiftShader sample at 1024 × 768 measured **46,542 triangles / 192 draw calls / DPR 1**, median interval **265.1 ms**. The completed scene at 1440 × 1000 measured **45,898 triangles / 191 draw calls / DPR 1**, median interval **196 ms**. See `wonders-metrics.json` and `celebration-metrics.json`. These are local software-renderer observations under load, including a paused settings overlay, not physical-device FPS evidence.

The final wonders console log contains no uncaught application exception in normal play. The existing `THREE.Clock` deprecation remains, and the deliberately disabled-WebGL case logs its handled renderer failure. Other regression cases intentionally exercise broken models and missing images. Live Tripo, Safari/Firefox, physical touch/audio hardware, screen-reader behavior and deployed hosting remain unverified. No paid generation ran.

## One personal detail that travels — 2026-09-30

- **A little saying (optional)** accepts a creator-authored phrase up to 60 characters, with an inline paper-tag preview. It can be cleared. It is explicitly visible from the opening, not a hidden message or an additional personal-data requirement.
- The same words appear at the opening, follow the collected star on the hero's movement wrapper, and are tucked into the final letter. Delivery removes the carried tag; folding/rereading retains the letter tag; replay starts over. The message itself is not rewritten.
- The moving tag is readable DOM anchored into the scene, with no extra geometry or per-frame React state. Game status includes its text for assistive technology, while the moving duplicate is hidden from the accessibility tree. A visible DOM alternative remains when WebGL fails. Pause and reduced motion use the existing game settings.
- Draft persistence and immutable snapshots include the saying. Later draft edits do not mutate a published version. Missing legacy values default to empty on read without rewriting stored JSON, and blank gifts show no tag. There is no migration, new dependency, provider request or paid generation.

Verification: **38 unit tests, TypeScript, production build and `git diff --check` passed. All 23 Chromium E2E tests passed in 8.2 minutes.** After the final creator-only contrast/responsive refinements, the persisted draft/share/isolation/revoke/delete and mobile authorization tests passed again, and the three dedication tests passed in a final 1.3-minute run. The final run covers the moving tag's position, paused stability, keyboard play, touch/reduced motion at 320px, literal maximum-length text, folding/replay, legacy omission, saving/clearing, server rejection above the limit and creator overflow checks at 390px and 320px. The full suite also verified the no-WebGL tag and existing generation, drawing-permission, reveal and letter behavior.

Visual review moved the long carried tag above the hero, strengthened the creator preview's text contrast, and caught/fixed a creator-grid minimum-width overflow on mobile. Initial keyboard tests needed an enabled-control check; final pause measurements wait for two rendered frames, and viewport assertions scroll the form field into view. These test synchronization corrections do not bypass quest actions or progression.

Actual evidence: `evidence/dedication-*.png` includes inspected desktop/mobile opening, carried star, final letter and loaded creator previews, plus a desktop mailbox view. `evidence/dedication-walkthrough.mp4` is an **actual 31.72-second silent browser recording, 800 × 554** (769,627 bytes), showing the opening, collection, carrying, pause, delivery, letter, folding and replay. The asset board includes the three appearances of the same tag. Long-text/legacy gift payloads are explicit test fixtures; the default example and saved/published draft flows use the real local application and original procedural Pip.

The completed-scene budget regression measured **41,810 triangles / 173 draw calls / DPR 1**, with a 120-frame median interval of **106.4 ms** in Chromium SwiftShader at 1440 × 1000. This is software rendering, not a physical-device FPS claim; the tag adds no mesh geometry. The dedication console log contains no uncaught application exception, only existing `THREE.Clock` deprecation and screenshot-related `ReadPixels` warnings. Deliberate missing-image, malformed-model and disabled-WebGL errors remain expected full-suite cases. Safari/Firefox, real screen readers, physical touch/audio hardware, live Tripo output and deployed hosting remain unverified. Game UI guidance kept the detail contextual and the playfield visible, with readable DOM text instead of extra controls.

## A letter at the ending — 2026-09-30

- Delivery now presents a sealed envelope addressed to the recipient, with a heart seal and a small star stamp. The celebrating island remains visible.
- **Open your letter** reveals the entire unchanged message on warm stationery, preserving line breaks, followed by the creator's name and a quiet postscript from the hero. There is no typewriter effect or generated rewriting.
- Fold and reopen the letter without restarting the quest. Replay starts a new adventure with a sealed letter. Focus moves to the envelope or letter heading, and a native focusable scroll region keeps long notes readable with keyboard input.
- Pause freezes opening; reduced motion skips the opening animation. Touch, mouse and keyboard use the same controls. The optional original remains permission-gated and its ending image loads only when the keepsake section is opened. A broken drawing does not hide the letter.
- No provider calls, dependencies, database changes or published-snapshot mutations were added. The note reveal is presentation, not encryption: an authorized gift response already contains its message.

Final verification: **33 unit tests and all 20 Chromium E2E tests passed (7.3 minutes for the full browser suite), as did TypeScript, the production build and `git diff --check`.** The four new browser tests cover the sealed/read/fold/replay lifecycle, focus, paused opening, reduced motion, an actual touch tap, keyboard scrolling through a 1,200-character message at 320px, no request for a forbidden drawing, and an opted-in image failure at 390px. Existing creator/share/isolation/revocation, reveal, celebration and WebGL fallback tests also passed with the new letter step. An initial narrow-view test failed its keyboard-scroll assertion; the final test focuses the native scroll region and verifies PageDown reaches the signature. Envelope spacing was also tightened after visual review.

Actual evidence: `evidence/letter-envelope-desktop.png`, `letter-open-desktop.png`, desktop/mobile counterparts and the long-note/signature captures were visually inspected. `evidence/letter-walkthrough.mp4` is an **actual 46.96-second silent browser recording, 800 × 554**, covering delivery, opening, keepsake, folding/reopening and replay. The asset board now includes the envelope and opened letter. Pip remains the explicitly procedural sample; mocked gift responses are used only for the long-text/privacy/error tests.

The existing scene budget regression still passes: **41,810 triangles / 173 draw calls / DPR 1** in the completed example. The latest 120-frame SwiftShader sample's median frame interval was **105.6 ms**; this software-rendered capture is not a physical-device frame-rate claim. No unexpected uncaught application exception appeared in the letter log. Existing `THREE.Clock` warnings and the deliberately missing image's HTTP 404s remain; malformed-model and disabled-WebGL errors are intentional cases in the full suite. Safari/Firefox, real screen readers, physical touch devices, live Tripo output and deployment remain unverified.

## Island-celebrates-progress update — 2026-09-30

- Each correct bell lights one of three ribbon sections. A wrong bell resets the lit prefix; solving the gate keeps all three lit.
- Collecting the star opens five garden buds. Flowers remain open after the star is delivered, even though the carried-star flag clears.
- Delivery warms the existing sunlight and grass, adds a golden rim and gently reveals six small stars. These are authored scene details, not generated assets or new game rules.
- Pause freezes the effects; reduced motion immediately displays earned rewards. Replay resets them. DOM hints describe the same milestones, including a screen-reader ending announcement. Duplicate mailbox interactions cannot overwrite the completed gift's status.
- Existing drawing reveal, creator/share/privacy flow and original permission controls are preserved. No dependencies, paid generation calls, extra light sources or postprocessing were added.

Verification: **29 unit tests passed; the full 16-test Chromium E2E suite passed in 5.6 minutes; TypeScript, optimized production build and `git diff --check` passed.** New tests cover milestone prerequisites, wrong-bell reset, persistent blooms, duplicates, replay, bounded/reduced/paused motion, a pixel-identical paused canvas, keyboard controls and a 390 × 844 low-quality viewport. A focused desktop rerun passed after the ending screenshot was moved after the render warm-up. The final duplicate-status guard was subsequently covered by the rerun unit tests, production build and one complete mobile keyboard/reduced-motion browser test; it does not change progression prerequisites.

Desktop/mobile before, ribbon, garden and ending screenshots in `evidence/celebration-*.png` were visually inspected. `evidence/celebration-walkthrough.mp4` is an **actual 65.72-second, silent browser recording, 800 × 554**, including wrong-bell retry, collection, delivery and replay. The hero is the procedural example, not Tripo-generated.

The updated ending sample measured **41,810 triangles / 173 draw calls / DPR 1**, below the 150,000 / 250 geometry budgets. The 120-frame Chromium SwiftShader sample's median interval was **116.4 ms** at a 1440 × 1000 viewport. Software-rendered capture is visibly slow and is **not** evidence of a real-device frame-rate target. See `evidence/celebration-metrics.json`. Normal celebration runs had no uncaught application exceptions; the existing `THREE.Clock` deprecation and screenshot-related GPU `ReadPixels` warnings remain. The full suite intentionally exercised malformed-model and disabled-WebGL errors. Safari, Firefox, physical mobile hardware, live Tripo output and deployed hosting remain unverified.

## Drawing-meets-world update — 2026-09-30

The recipient opening now lifts the permitted drawing, presents the same playable hero beside it, and pulls the camera into the island. It supports skip, pause, keyboard focus, mobile framing and static reduced motion. Hidden originals are neither mounted nor fetched. Creator permission text covers both reveal and ending. See `REVEAL.md`.

Checks for this update: **23 unit tests passed; 13 Chromium E2E tests passed in 3.7 minutes; TypeScript and optimized production build passed.** The five added browser tests cover reveal/quest separation, single-canvas continuity, mobile/reduced-motion/keyboard operation, pause/skip, no unauthorized drawing fetch, image failure and one test-model download across reveal and gameplay. Final visual review caught a mobile camera-sizing race: the camera now reads live render-frame size instead of a React closure. All **6 reveal/fallback browser tests passed again** after this correction, and the corrected mobile capture was visually inspected. One additional focused run passed with an explicit assertion that the paper fades out during the camera entrance. The actual new recording is `evidence/reveal-walkthrough.mp4` (24.60 seconds, silent, 1440 × 1000); the original full walkthrough below predates this enhancement.

An earlier regression run encountered a Turbopack hot-reload internal error during concurrent final edits/build activity and was stopped (12 tests passed, one interrupted). The final run used a restarted server with unchanged source and passed all 13 tests without that error. A first recording attempt hit its default 5-second assertion timeout during software-rendered movement; the recording helper now uses the same 30-second assertion allowance as the original walkthrough helper. The existing `THREE.Clock` deprecation warning remains. Intentional malformed-model/no-WebGL tests still log their expected errors; no unexpected application exception was observed in the final reveal tests.

No paid generation ran. Pip remains the procedural example; the GLB continuity test uses an explicit mock. Safari/Firefox, physical devices and live Tripo output remain unverified. The previously measured rendering numbers below are baseline measurements, not a new performance claim for the reveal.

## Original delivery baseline — historical record

The following baseline predates the live runs reconciled above. Its test counts and remaining work describe the original delivery only.

## Works locally at the original delivery

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

## Executed checks at the original delivery

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

## Live versus example versus mocked at the original delivery

| Item                                                                                                     | Evidence level                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pip drawing and toy-like hero                                                                            | Original repository assets. Hero is procedural, **not Tripo-generated**.                                               |
| Quest, personalization, SQLite persistence and share lifecycle                                           | Real local application behavior, tested in browser.                                                                    |
| Tripo upload, image-to-model, task retrieval and safe worker processing                                  | Real server adapter implemented from current official v3 documentation; automated network responses explicitly mocked. |
| Successful provider generation, charge count, provider CDN output, generated-model browser compatibility | **Not run**: no Tripo credentials were available. Follow the [live smoke-test steps](operations.md#live-smoke-test).   |
| Optional sketch enhancement                                                                              | Not implemented; direct image-to-model is the supported path.                                                          |

Arbitrary uploads in example mode do not silently receive Pip. Failed live generation is never replaced by a sample. Recipient viewing and gameplay do not call paid generation APIs.

## Remaining limitations at the original delivery

- [ ] Live Tripo smoke test and actual generated-model provenance/performance evidence. The proposed Tripo event track remains conditional on this evidence.
- [ ] Docker image build, persistent-volume deployment, HTTPS/reverse-proxy operation, backup/restore and production failure testing. Configuration is for one persistent node, **not ephemeral serverless**.
- [ ] Safari, Firefox, physical phone/touch hardware, screen-reader audit and physical sound playback. Keyboard and emulated narrow/touch-compatible viewport behavior were tested in Chromium.
- [ ] A narrated recording and event submission. The supplied real recording is silent; no entry has been submitted.
- Owner-cookie loss has no account recovery. An unlisted link is accessible to anyone possessing it. Revocation cannot retract previously downloaded copies.
- Target play time is approximately 2–3 minutes by design, not validated with children or guaranteed for every player. No formal child-privacy compliance or legal certification is claimed.

The game-development guidance influenced the separation of deterministic quest rules, input handlers, camera, waypoint movement and character rendering. The frontend/playtest guidance informed the scene-led presentation and actual desktop/mobile browser evidence.
