# DoodleQuest

**Your drawing deserves a world.** An adult-created, family-oriented browser prototype that turns a drawing into a 3D interpretation and the hero of a small playable gift.

Create a character, write a personal note, and share an unlisted adventure. The recipient rings three bells, collects a star, and delivers it to open their letter. The included Pip example works without credentials or paid generation.

![The procedural Pip example at the bell gate](evidence/gameplay-desktop.png)

## Quick start

Use **Node.js 24 and npm**, matching the repository's Docker image. Run these commands from the repository root:

```sh
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Copy the environment template only on first setup; keep an existing `.env`. Leave its credentials blank to use example mode. `db:seed` renders the repository's Pip drawing and initializes the schema; it makes no provider calls.

Open [http://localhost:3000](http://localhost:3000), the default `APP_ORIGIN`. `npm run dev` starts both Next.js and the durable Node worker; Ctrl+C stops both. Use the exact configured origin for creator actions: `localhost` and `127.0.0.1` are not interchangeable.

| Route                                       | What to try                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`/example`](http://localhost:3000/example) | Play the complete procedural example without credentials.                                                                                           |
| [`/create`](http://localhost:3000/create)   | Choose **Try it with our Pip drawing**, wait for the preview, and select **That’s my hero**. Add your words, preview, then wrap and publish a gift. |
| `/preview/<project-id>`                     | Play an owner-only draft preview from the workshop.                                                                                                 |
| `/gift/<token>`                             | Open an immutable published gift; recipients need no account.                                                                                       |

Drafts are stored on the server, with ownership tied to this browser's cookie. Keep that cookie: there is no account recovery. No child name, age, photo, school, or location is required.

## Choose a mode

| Mode                       | Configuration                                          | What it proves                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Example** (default)      | Leave `TRIPO_API_KEY` blank.                           | Complete quest, draft saving, approval, sharing, revocation and deletion with authored procedural Pip. **Pip is not Tripo-generated.** Custom uploads need live generation to become a hero. |
| **Live**                   | Server-side `TRIPO_API_KEY` and `CREATOR_ACCESS_CODE`. | The adapter uploads to Tripo, submits a task, polls and validates a protected GLB. Successful live generation remains unverified in the recorded delivery.                                   |
| **Mock** (automated tests) | `E2E_MOCK_PROVIDER=1`, nonproduction only.             | Deterministic provider responses and a labeled octahedron GLB. Production rejects this flag; mock results are not live evidence.                                                             |

Live browser generation requires an unlocked creator session, explicit drawing-transfer consent and an available quota reservation. The default cap is **10 lifetime attempts for the installation and for each session**, including failed or uncertain attempts. See [configuration](docs/configuration.md) before enabling it and the [live smoke test](docs/operations.md#live-smoke-test) before claiming provider success.

## Create and play

The gift includes a permission-aware drawing reveal, an optional 60-character saying that travels with the star, a letter containing the creator's saved note, and a wrapping review before publication. Optional flower, cloud and butterfly interactions add small moments along the path. Gentle sounds are off by default and synthesized locally.

Mouse, touch and keyboard controls share the same quest. Pause, reduced motion, low rendering quality and a readable no-WebGL alternative are available. See the [creator and recipient guide](docs/experience.md) for the complete flow, controls and privacy behavior.

## Documentation

| Guide                                                                    | Use it for                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [Configuration](docs/configuration.md)                                   | Environment variables, modes, credentials, quotas and local ports.                    |
| [Operations and troubleshooting](docs/operations.md)                     | Web/worker deployment, persistent storage, generation recovery and live verification. |
| [Creator and recipient guide](docs/experience.md)                        | Making, playing, sharing, revoking and deleting gifts.                                |
| [Contributing](CONTRIBUTING.md)                                          | Development commands, focused tests, recording evidence and Git conventions.          |
| [Architecture](ARCHITECTURE.md)                                          | Source map, ownership, snapshots, worker reliability and rendering budgets.           |
| [Verification record](COMPLETION.md)                                     | Dated check results, measurements and unverified layers.                              |
| [Asset provenance](ASSET_PROVENANCE.md)                                  | Origins and permissions for drawings, geometry, music and generated assets.           |
| [Demo script](DEMO_SCRIPT.md) · [Asset board](evidence/asset-board.html) | Recorded product evidence and suggested narration.                                    |
| [Drawing reveal](REVEAL.md) · [Submission notes](SUBMISSION.md)          | Feature-specific evidence and the conditional event submission draft.                 |

## Delivery status

This is a locally verified prototype. [COMPLETION.md](COMPLETION.md) records unit, Chromium, build and rendering checks with their dates and scopes; it is not a claim that every check has just been rerun. The [92.56-second baseline walkthrough](evidence/walkthrough.mp4) uses procedural Pip and predates later feature recordings.

Live Tripo output, Docker deployment, hosted HTTPS, backup/restore, Safari/Firefox and physical device/audio behavior remain unverified in that record. Deployment requires **one persistent node with shared local SQLite and asset storage**; ephemeral serverless hosting is unsuitable.

Gift links are **unlisted, not fully private**. Anyone with a link can view its saved snapshot. Revocation blocks future requests but cannot retract downloaded copies. Project deletion removes local access and queues local file cleanup; provider-side deletion is not promised. Read the [privacy and sharing details](docs/experience.md#privacy-and-sharing) before using personal artwork.
