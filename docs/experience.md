# Creator and recipient guide

[Back to README](../README.md) · [Configuration](configuration.md) · [Troubleshooting](operations.md#troubleshooting)

## Make your first gift

Start the app using the [quick start](../README.md#quick-start), then open `/create`.

1. Choose **Try it with our Pip drawing** for a complete no-credentials walkthrough. To generate from another drawing, use **Choose a drawing**, save the upload and follow the [live-generation setup](configuration.md#live-generation).
2. Wait for the hero preview to load. Rotate it to inspect it, choose its name and movement, and adjust which way is forward. Choose **That’s my hero** to approve the visible result.
3. Add the recipient, creator, title and note. Optionally add **A little saying** and choose the world's palette. **Show the original drawing to the recipient** is off by default; enabling it includes the drawing in the introduction and ending.
4. Choose **Save & preview**, then **Play the whole adventure**. Check the words, drawing permission and ending before sharing.
5. Return to **Preview & share → Wrap this gift**. Review the recipient, note and drawing permission, then choose **Seal & publish gift**. The parcel receives its ribbon and seal after the server confirms the saved snapshot.
6. Copy the confirmed link or open it yourself. Nothing is sent automatically. Cancel or Escape before sealing to leave without publishing.

**Save draft for later** retains work under the current owner session. Drafts live in server storage, while the browser cookie grants access. Keep the same browser/profile and cookie; the access code does not recover a lost session.

### Personalization limits

These values are trimmed and validated by [`GiftConfigSchema`](../src/domain/config.ts). Names and messages render as plain text; the app does not rewrite them.

| Field                 | Limit or options                                       |
| --------------------- | ------------------------------------------------------ |
| Recipient and creator | 1–50 characters each                                   |
| Gift title            | 1–80 characters                                        |
| Hero name             | 1–32 characters                                        |
| Note                  | 1–1,200 characters; internal line breaks are preserved |
| A little saying       | Optional, up to 60 characters                          |
| Hero movement         | Bounce, float or sway                                  |
| Forward direction     | −180° to 180°                                          |
| World palette         | Meadow, sunset or sky                                  |

The saying is visible from the opening, travels above the collected star and appears in the final letter. Leave it blank to omit the tag. Older gifts without a saying continue to work.

Uploads must be still JPEG or PNG images up to 10 MB, 64–8000 pixels per side and at most 24 million pixels. The server decodes them, removes metadata and stores a normalized PNG original separately from the crop/rotation input used for generation. The stored original is not a byte-for-byte archival copy of the upload.

## Play the adventure

Open `/example`, an owner preview, or a published gift link:

1. Choose **Open my gift** to meet the hero. If the saved gift includes drawing permission, the original appears alongside it. Choose **Enter the little world**, or **Skip reveal** to go straight to the quest.
2. Visit **1 Bell gate** and ring **circle → triangle → star**. Correct bells light the island ribbon. A wrong sequence lets you try again.
3. Visit **2 Star garden** and choose **Collect the star**. The garden flowers open and the hero carries the star.
4. Visit **3 Gift mailbox** and choose **Deliver the star**. The island celebrates and presents a sealed envelope.
5. Choose **Open your letter** to read the creator's saved note. Fold it for rereading or play again to reset the adventure.

The introduction does not bypass quest prerequisites. The letter's opening is a presentation reveal: the authorized gift response already contains its text.

### Optional moments and controls

| Feature                           | Behavior                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Little wonders**                | Tap the sleepy flower, cloud or butterfly in the scene, or use the equivalent DOM buttons. These moments are repeatable and optional; they add no quest requirements or collectibles.                  |
| **Gentle sounds**                 | Off by default. Enable at the opening or in settings to hear the bells, star echo and short returning melody when first opening the letter. Audio is synthesized locally from an original fixed score. |
| **Play the melody / Stop melody** | Listening explicitly enables sound. Folding and reopening the letter does not automatically repeat the tune. Mute, pause, folding, replay and leaving the page stop playback.                          |
| Pause and reduced motion          | Pause freezes visual progression. Reduced motion settles supported effects without animated travel. Sound never becomes necessary to complete the quest.                                               |
| Keyboard and touch                | DOM buttons offer the same quest and wonder actions as pointer controls. Long letters have a scrollable reading area.                                                                                  |
| Low quality and no WebGL          | Lower rendering quality reduces rendering cost. If 3D is unavailable, the readable alternative keeps story controls and describes optional moments in words.                                           |

These authored effects require no extra generation, credentials, audio downloads or microphone access. Chromium keyboard and emulated touch checks are recorded in [COMPLETION.md](COMPLETION.md); physical devices, screen-reader behavior and physical audio playback remain separate unverified layers.

## Privacy and sharing

Each published link points to an **immutable snapshot** of the approved hero, words and drawing permission. Editing the draft later does not change existing versions. Publish a new version for changes and revoke old links separately in the workshop.

Links are **unlisted, not fully private**: anyone possessing one can view it. Recipients need no account. Recipient routes never invoke paid generation, and a gift token grants no access to the owner's draft. Each protected asset request checks the owner session or an active gift token referencing that exact asset. Drawing-disabled snapshots do not include the original drawing asset.

**Revoke** denies future requests through that gift link. It cannot erase downloaded copies or content already displayed in an open browser. Closing the wrapping dialog does not revoke a saved gift. If a publication response is lost, **Check saved gift links** checks for an existing saved version without automatically publishing again.

**Delete this project** removes its draft, jobs, snapshots and asset references, revoking local access. Local file deletion is retried through a durable queue when the filesystem is unavailable. Minimal anonymous attempt counts remain to enforce quotas. The app does not promise deletion from Tripo. Session expiry does not automatically delete projects or files.

Use artwork you have permission to upload and share. No child name, age, photo, school or location is required. This prototype does not claim formal child-privacy compliance or legal certification.
