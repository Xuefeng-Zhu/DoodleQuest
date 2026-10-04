# DoodleQuest — Tripothon S1 submission package

Prepared on October 3, 2026. **The remote Game + Tripo draft has Team, Project and Media & Demo completed; it is not a final event entry.** Prior-work disclosure, declarations and final review remain. The public source and deployment implementation are merged into `main`.

## Event and required materials

The [official event page](https://developers.tripo3d.ai/en/events/tripothon-s1), checked October 3, lists a playable demo, actual screen walkthrough and visual asset board as required. A public build log is optional. Tool entries require actual use. The live [submission portal](https://activity.tripo3d.ai/en/submit) displays **October 5, 2026, 23:59 AoE (UTC−12)**, equivalent to **October 6, 2026, 04:59 PDT**. Submit well before the cutoff.

The authorized remote draft has **Game** selected as its Direction Track and **Tripo** as its Tool Track. The user completed Team, and Project and Media & Demo have been saved. Project contains the English title (11/60 characters), tagline (74/100), gift recipient line (35/60), description below (1714/2000) and tools used. Team contact details and the private edit link are excluded from this public repository.

My Submissions lists DoodleQuest as **DRAFT · GAME · TRIPO**. Reopening the draft retained Team and the Awards & Declarations text: Tripo contribution (455/500 characters) and asset disclosure (862/1000). The prior-work question still requires the user's answer. All six rights, rules and promotional-license declarations remain unchecked; **Review is locked and no final event entry has been submitted**.

## Title and short pitch

**Title:** DoodleQuest

**Tagline:** Turn a drawing into the hero of a little world, made for someone you love.

**One-sentence description:** DoodleQuest uses Tripo to turn an original drawing into a playable 3D character that carries a star and a personal message through a small browser adventure.

## Project description — saved portal copy

DoodleQuest turns a drawing into the hero of a little world made for someone you love. An adult creator selects artwork they have permission to use, previews and approves the character, adds a recipient and personal note, and wraps the adventure into an unlisted gift link. The recipient needs no account: open the drawing reveal, ring three musical bells, collect a star and deliver it to unlock the letter.

Tripo supplies the personalized 3D character through image-to-model generation. The application retains task IDs, validates completed GLBs and reuses the approved model throughout the gift. The supplied walkthrough shows a real Tripo-generated Mom & Dad character completing the adventure. Its source is an OpenAI-generated illustration of fictional adults; the child-to-parents story is authored demonstration material, not a real child's drawing or family.

The public demo runs on Vercel Hobby and Neon Free with an authored procedural Pip example. Judges can play, personalize, save and share gifts without a provider key. Paid Tripo generation is disabled on this deployment. Live image-to-model generation was verified separately in local runs; hosted Tripo generation and live rigging remain unverified.

Next.js, React Three Fiber, Three.js, PostgreSQL and Vercel Workflows support the experience. Saved drafts, explicit approval, immutable gift versions and revocation give creators control. Keyboard controls, reduced motion, lower rendering quality and a readable fallback offer different ways to play.

The world, quest, stationery and synthesized melody are authored application content. The creator supplies the emotional message; the short quest gives its recipient a role in receiving it.

## Problem, audience and theme

**Problem:** Sending someone an image can preserve a drawing, but it gives the recipient little to do with it. Creating a personalized game usually demands modeling, game development and hosting skills.

**Audience:** Adults making a small interactive gift for family or friends, using artwork they own or have permission to use. The prototype does not require a child's name, age, school or photo.

**Theme fit:** “Build a world as a Gift” is the complete product loop: drawing → personal hero → shared world → recipient action → personal ending. The world exists for its recipient.

**Why it matters:** AI-generated geometry becomes part of an authored, understandable interaction. The creator supplies the emotional content; a short quest gives the recipient a role in receiving it.

## How Tripo contributes — paste-ready

Tripo supplies the personalized 3D hero. The server uploads the drawing reference, submits an image-to-model task, retains the provider task ID and polls it through durable job steps. Completed GLBs are downloaded into protected PostgreSQL storage, validated against resource limits, normalized for the game and presented for creator approval. That stored character is then used in the recipient's adventure.

Two successful live generations are represented in the saved local verification records. The corrected Mom & Dad walkthrough reuses the second generated character without another generation. Its source is an OpenAI image-generated illustration of a generic adult couple, created for this demonstration; the child-to-parents story is fictional. The playable world, quest rules, scenery, stationery and synthesized melody are authored application content. The bundled no-key Pip example is procedural and is labeled separately.

Optional Tripo rigging and animation are implemented and covered by a skinned test fixture. **Successful live Tripo rigging and retargeting have not been demonstrated.** Do not describe the recorded hero as live Tripo-rigged or the whole world as AI-generated.

## Working features

- Drawing selection, crop/rotation, transfer consent, resumable generation and 3D preview.
- Creator-approved hero, recipient name, short saying, personal note and world palette.
- Drawing reveal, three-bell sequence, star collection, mailbox delivery and letter ending.
- Optional flower, cloud and butterfly interactions; sound off by default.
- Persistent drafts, wrapping review, immutable unlisted links, revocation and deletion.
- Keyboard and pointer controls, reduced motion, lower rendering quality and text fallback.

## Architecture and build process

Next.js and React provide the creator workflow and server routes. React Three Fiber and Three.js render the world. A deterministic TypeScript quest model drives the same actions from scene and accessible controls. Neon PostgreSQL with Drizzle stores sessions, drafts, tasks, gift snapshots and private asset bytes. Vercel Workflows schedules long-running Tripo tasks with saved provider IDs, transaction-protected leases and bounded retries. Local tests use embedded PostgreSQL.

Codex assisted with implementing the product flow, the Tripo adapter and worker, responsive interfaces, automated tests and visual iteration. Focused Git commits and [dated verification notes](docs/COMPLETION.md) record the work. This preparation reconciles those notes with saved provider and recording evidence; it does not expose private Codex conversations.

**Built with:** TypeScript, Next.js, React, React Three Fiber, Three.js, Tripo API, Node.js, Vercel, Neon PostgreSQL, Drizzle ORM, Vitest, Playwright, Codex.

## What to show the judges

The official Direction weights are creativity 30%, completeness 25%, theme fit 20%, viral potential 15%, commercial value 10%. Tool weights are inventive use 35%, synergy 25%, contribution 20%, theme fit 10%, breakout potential 10%. [Source](https://developers.tripo3d.ai/en/events/tripothon-s1).

Our presentation choices:

| Focus                        | Concrete evidence to show                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Original idea and gift theme | The character carries the creator's saying to a letter for Mom & Dad.                           |
| Complete experience          | Approval, personalization, opening, bells, star, delivery and letter in actual product footage. |
| Tripo contribution           | Drawing beside the real generated model, then the same model participating in the quest.        |
| Sharing potential            | A recipient can play an unlisted gift without an account. No user-growth claim.                 |
| Future value                 | A possible personalized-gifting product; monetization and market demand remain unvalidated.     |

## Playable demo and judge instructions

**Public demo:** [DoodleQuest](https://doodlequest-six.vercel.app), running on Vercel Hobby with Neon Free in example mode. The procedural Pip example is publicly playable; paid Tripo generation is disabled.

**Repository:** [Xuefeng-Zhu/DoodleQuest](https://github.com/Xuefeng-Zhu/DoodleQuest) — **public** at the user's request, with anonymous GitHub access verified. Source and reviewed media are accessible to judges. No root license file is currently present; making the repository public does not establish a reuse license. The deployed application revision is `37cac02`, merged into `main` at `56c6344` through [PR #1](https://github.com/Xuefeng-Zhu/DoodleQuest/pull/1).

1. Open the [Pip example](https://doodlequest-six.vercel.app/example), start the gift and follow the scene or accessible controls to the bell gate.
2. Ring circle → triangle → star, collect the star, deliver it to the mailbox and open the letter. Replay is available. The rendered 3D example and this complete story were verified in the hosted browser.
3. Open the [creator](https://doodlequest-six.vercel.app/create), choose **Try it with our Pip drawing**, approve the hero, add words, preview, wrap and publish. A recipient needs no account. Keep the creator browser's cookie to manage the gift afterward.

Local fallback from the public source repository:

1. Use Node.js 24 and npm. Check out `main`, which includes the hosted implementation, and run `npm ci`.
2. Copy `.env.example` to `.env` only when no local environment file exists. Leave credentials blank for procedural example mode.
3. Run `npm run db:migrate`, `npm run db:seed`, then `npm run dev`.
4. Open `http://localhost:3000/example`. Start the gift and follow the visible controls to the bell gate. Ring circle → triangle → star, collect the star, deliver it to the mailbox and open the letter. Replay is available.
5. Open `/create`, choose **Try it with our Pip drawing**, approve the hero, add words, preview, wrap and publish. Open the link in a separate browser context to exercise the recipient flow.

The hosted demo and local fallback use authored procedural Pip. They demonstrate the gift flow without a provider key; they do **not** reproduce the Tripo hero in the supplied recording or establish hosted Tripo/Workflow success. Judge access to the recorded generated gift still requires a reviewed hosting or distribution plan. Do not package the runtime database, creator cookies, `.env` files or provider keys.

## Video and visual materials

- Primary walkthrough: [walkthrough.mp4](evidence/tripothon-s1/walkthrough.mp4).
- Visual asset board: [asset-board.html](evidence/tripothon-s1/asset-board.html) and [asset-board.png](evidence/tripothon-s1/asset-board.png).
- Evidence provenance and verification: [verification.json](evidence/tripothon-s1/verification.json).
- Suggested narration and historical recording context: [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

The portal's Media & Demo step is saved with the [public walkthrough MP4 URL](https://raw.githubusercontent.com/Xuefeng-Zhu/DoodleQuest/main/evidence/tripothon-s1/walkthrough.mp4), [public live demo](https://doodlequest-six.vercel.app) and [repository](https://github.com/Xuefeng-Zhu/DoodleQuest). `hero-preview.jpg` is uploaded as the cover. The gallery contains four uploaded images: `asset-board.png`, `hero-preview.jpg`, `recipient-opening.jpg` and `letter.jpg`. The portal warns that covers outside 16:9 may be cropped; the selected cover is not 16:9.

The 87.33-second walkthrough is assembled from actual browser captures sampled at approximately 5 fps and encoded at 24 fps. It is silent, removes tool-idle gaps and visibly accelerates generation waits 8×. Local gift links are masked for the shareable copy. Its source capture predates the latest background and motion work. Do not claim continuous real-time capture, provider latency, or that it showcases every feature in the current branch.

Suggested narration, if adding voice later:

> This started as a drawing. Tripo turned it into the hero of a little world. Add a few words for someone you love, then send them an adventure. Mom and Dad open the gift, ring three bells, carry a star and find a letter from their little artist. The character makes the journey; the message remains yours. This is DoodleQuest — your drawing deserves a world.

Show the source artwork, generated hero preview, personalized gift opening, star-carrying moment and letter/signature. Keep the actual interaction visible. Do not cover loading with a fabricated success sequence, and do not label sped-up capture as real-time provider latency.

## Verification and limitations

- October 3 migration checks: **147 tests across 16 files**, TypeScript and production build passed. All **42 distinct Chromium cases** passed across the full run and one focused rerun. PostgreSQL 17.11 concurrency/restart checks passed locally. These supersede the earlier submission-preparation run of 96 tests on revision `72dda95`; detailed scopes remain in [COMPLETION.md](docs/COMPLETION.md).
- Hosted HTTPS checks passed on application revision `37cac02`: Neon readiness, sample draft/approval/publication, isolated ownership, immutable gift snapshots, exact drawing bytes across redeployment, anonymous recipient access and gift/asset denial after revocation. The rendered procedural 3D example was visually verified and its story completed through accessible controls to the letter.
- Recorded live provider results and media were re-inspected for this package; no new paid call was made.
- Hosted Workflow execution, hosted live Tripo generation/rigging, large GLB streaming, Docker application deployment, backup/restore, Safari/Firefox, physical mobile hardware and physical speaker playback remain unverified. Compiling Workflow routes does not establish a hosted run.
- Unlisted links are accessible to anyone who has the link. Revocation cannot retract downloaded copies. Owner-cookie loss has no recovery, and provider-side deletion is not promised.
- No child testing, formal privacy certification, user adoption or commercial validation is claimed.

## Final preparation checklist

- [x] Confirm Tripothon S1 and prepare Game + Tripo positioning.
- [x] Draft copy grounded in actual product behavior and live evidence.
- [x] Provide hosted and local demo paths and document their procedural Pip hero.
- [x] Finish media privacy review, visual inspection and package integrity checks; local gift links are masked in the shareable walkthrough.
- [x] Provide a judge-accessible procedural Pip demo with verified hosted persistence and recipient access.
- [ ] Resolve playable judge access to the recorded Tripo hero for the proposed tool-track entry.
- [x] Make the source repository and reviewed media public; anonymous repository access verified.
- [x] Save the public walkthrough URL and upload the asset board in the portal's gallery, alongside the cover and supporting screenshots.
- [x] Open the authorized remote draft with Game + Tripo selected.
- [x] Complete Team, save Project within its field limits, and save Media & Demo.
- [x] Enter the Tripo contribution and asset disclosure within their field limits.
- [ ] Answer the prior-work question and confirm artwork/output rights and required declarations in the actual form.
- [ ] Check the cover crop and complete Review after it unlocks.
- [ ] Review the completed remote entry and authorize its final submission before the deadline.

Do not treat this local checklist as registration, acceptance of rules, or confirmation of an event entry.
