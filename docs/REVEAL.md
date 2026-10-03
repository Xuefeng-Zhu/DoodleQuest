# Drawing meets world

A recipient-side introduction, shared by `/example`, creator previews and published gifts. No new provider calls, project fields or snapshot mutations.

## Experience

1. **Open my gift** lifts the permitted original drawing on a paper card (0.9 seconds).
2. The same loaded character used in gameplay appears beside it. This moment waits for the recipient; it does not hurry them into the game.
3. **Enter the little world** clears the paper stage and pulls the camera back into the existing island (1.8 seconds). Quest controls activate after the entrance.
4. **Skip reveal** goes directly to the bell-gate objective, not past its prerequisites. Replay starts from the sealed gift again.

With drawing permission off, the original is neither mounted nor fetched and the introduction centers the hero. The existing published snapshot remains authoritative. Creator permission copy now explicitly describes both reveal and ending use.

Reduced motion presents the comparison statically and enters the world without a camera flight. Pause freezes the sequence. Keyboard focus moves from the introduction heading to the bell-gate objective; all actions remain DOM buttons. Failed drawings have readable text, and unavailable 3D does not block the existing story controls.

## Boundaries

- `domain/reveal.ts`: pure presentation progression and permission check, independent of quest rules.
- `useGiftReveal.ts`: low-frequency phase changes; animation progress uses a ref. No per-frame React rerenders.
- `CameraRig.tsx`: close-up framing and camera pullback, reusing the existing canvas and character.
- `GiftReveal.tsx`: paper card, copy, accessibility and buttons. No upload, model-generation or paid API call.

The procedural example and test-only model are explicitly labeled. For real stored Tripo output, the caption says “a 3D interpretation,” not an exact reconstruction. No live Tripo generation was performed for this change.

## Evidence and reproduction

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
# With the local app running:
npm run demo:reveal
ffmpeg -y -i evidence/reveal-walkthrough.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart evidence/reveal-walkthrough.mp4
```

`tests/reveal.test.ts` checks permission, phase ordering, repeated/stale actions, skip, reduced-motion entry and easing bounds. `tests/reveal.e2e.ts` covers desktop composition, mobile/keyboard/reduced motion, privacy-off requests, pause/skip prerequisites and one model request across reveal and gameplay. The latter uses an explicitly mocked GLB, not provider evidence. Existing full-adventure tests also pass through the new introduction.

New captures are `evidence/reveal-desktop.png`, `reveal-mobile.png`, `reveal-world.png` and the actual `reveal-walkthrough` recording. The original 93-second `walkthrough.mp4` is retained as baseline evidence; it predates this introduction. Console observations and exact executed verification are recorded in `COMPLETION.md`.
