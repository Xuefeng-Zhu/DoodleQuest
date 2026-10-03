# Configuration

[Back to README](../README.md) · [Operations](operations.md) · [Contributing](CONTRIBUTING.md)

Start from [`.env.example`](../.env.example). Application defaults and validation live in [`src/server/env.ts`](../src/server/env.ts). Keep secrets in the server environment or ignored local environment files; never use `NEXT_PUBLIC_` for credentials or commit them.

## Environment reference

| Variable              | Default                 | Purpose and constraints                                                                                                                                                                                                        |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATA_DIR`            | `./data`                | SQLite and private assets. Relative paths resolve from the process working directory. Web and worker must resolve this to the **same persistent local directory**. Prefer an absolute path outside development.                |
| `APP_ORIGIN`          | `http://localhost:3000` | Browser origin used for mutation checks and published links. Set the exact scheme, hostname and port, without a path or trailing slash. Use the final HTTPS origin in production.                                              |
| `PORT`                | `3000` in the template  | Web listener port. `npm run dev` loads it before launching Next.js. For `npm run start` or `npm run dev:web`, supply a shell variable or the Next.js `--port` option; Next.js cannot take its listener port from `.env` alone. |
| `TRIPO_API_KEY`       | Empty                   | Server-only provider key. An empty key selects example mode unless the test mock is enabled. Restart web and worker after changes.                                                                                             |
| `CREATOR_ACCESS_CODE` | Empty                   | Shared code for unlocking paid generation in a browser owner session. Configure a strong value for live use. It does not restore drafts or act as a recipient password.                                                        |
| `TRIPO_MODEL`         | `v3.1-20260211`         | Model identifier passed by the current adapter. This is the repository default from its September 2026 integration review, not a claim about the latest provider model.                                                        |
| `GENERATION_QUOTA`    | `10`                    | Integer from `0` to `10000`. Lifetime cap applied independently to installation-wide and per-session attempt counts. `0` prevents new reservations.                                                                            |
| `POLL_INTERVAL_MS`    | `5000`                  | Integer from `500` to `60000`. Normal delay between task polls. Error backoff and provider retry headers can make the delay longer.                                                                                            |
| `TRIPO_ASSET_HOSTS`   | `cdn.tripo3d.ai`        | Comma-separated exact output hostnames. Review real provider output before adding a host; use no schemes, paths or wildcards. Downloads also validate HTTPS, ports, DNS addresses and redirects.                               |
| `E2E_MOCK_PROVIDER`   | `0`                     | Only the exact value `1` enables the test mock. Rejected when `NODE_ENV=production`. Let the test harness set it.                                                                                                              |

Other process settings are not included in the environment template:

| Variable        | Usage                                                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`      | Compose sets `production` for both services. Set it explicitly for a standalone production worker; the plain `tsx` worker command does not do this for you.                                                          |
| `NEXT_DIST_DIR` | Overrides `.next` in [`next.config.ts`](../next.config.ts). The browser-test launcher uses `.next-e2e` to separate its build output.                                                                                 |
| `DEMO_BASE_URL` | Base URL for recording scripts, defaulting to `http://localhost:3000`. Set it in the command's environment. `demo:record` creates a draft and published gift in that instance; `demo:reveal` visits only `/example`. |

The standalone server scripts load `.env.local`, then `.env`, without overriding existing process variables. Next.js also has its own environment loading rules. Use consistent values for both processes; do not put worker-only settings in `.env.production` and assume the worker will load them. Inspect environment files locally without copying secrets into logs or issue reports.

## Local ports and origin

For a different development port, update both values in your local environment file before starting `npm run dev`:

```dotenv
APP_ORIGIN=http://localhost:3001
PORT=3001
```

Browse to that exact origin. If Next.js chooses another port because the requested port is occupied, stop it and free the intended port or update both values deliberately. A mismatched origin causes creator mutations to fail even when the page loads.

`dev:web` binds to `127.0.0.1`; `start` binds to `0.0.0.0`. Compose publishes only `127.0.0.1:3000:3000` for a reverse proxy. Its port mapping is fixed: keep the container's `PORT=3000` unless you also change the mapping.

## Live generation

1. Configure the server key, creator access code, origin and quota in the same environment for web and worker. Keep `E2E_MOCK_PROVIDER=0`.
2. Start both processes and open `/create` on the configured origin.
3. Upload a permitted JPEG or PNG with **Choose a drawing** and save it. **Try it with our Pip drawing** deliberately selects the procedural example, even when live mode is configured.
4. Unlock generation with the creator code, acknowledge the drawing transfer, and request one generation.
5. Review the loaded result, adjust its forward direction and approve it before publishing.

The browser flow checks consent and session access before reserving an attempt. The repository records the reservation before the worker submits anything; failed, uncertain and deleted jobs still count. The cap has no automatic time reset, and new cookies do not bypass the installation-wide count. Quota is an application attempt limit, not a provider billing balance.

Changing `CREATOR_ACCESS_CODE` affects future unlocks; it does not relock sessions that are already unlocked. The current session implementation keeps that state until the fixed session expiry.

The current [`Tripo adapter`](../src/server/tripo.ts) requests textured image-to-model output with `face_limit: 20000`, standard textures, `pbr: false`, `enable_image_autofix: false` and geometry compression. Sketch enhancement is not implemented. Optional rigging and animation are requested separately from **Meet your hero** after a model is available. Stored output must independently pass the [asset budgets](ARCHITECTURE.md#asset-and-scene-budgets). Review current provider pricing and terms before a paid run.

### Optional hero animation

**Bring my hero to life** requires the same unlocked creator session and a separate acknowledgement of Tripo credit use. The worker checks compatibility, creates a rig, and requests an animation set. Each provider stage can consume credits; the application's attempt quota is not a credit balance. Refreshing the page and previewing motion never submit new provider tasks.

Bipeds use rig model `v1.0-20240301` and the documented idle, walk and cheer presets. Supported non-biped types use `v2.5-20260210` and their documented walk/march preset. The current avian preset list does not provide a usable movement set, so those heroes retain their existing motion. Retarget requests use GLB output, embedded animation and `animate_in_place: true`; DoodleQuest still controls navigation.

An unsupported or failed animation leaves the current hero available. A successful animated GLB replaces only the matching current draft model and requires approval again. Published gifts retain their previous model. Live rigging quality, clip naming, visual orientation and provider billing remain separate verification steps; the included animated fixture is a mock.

Refreshes and model-preview failures do not start new paid generations. A known task ID resumes polling after a worker restart. An uncertain submit without a saved task ID stops for review; use the [recovery table](operations.md#generation-recovery).

## Operator sample command

For an intentional paid sample attempt using the repository's drawing, configure the live key and keep `E2E_MOCK_PROVIDER=0`:

```sh
npm run sample:generate -- --confirm-paid
npm run worker
```

Run `db:seed` first if the sample PNG needs regeneration. The CLI requires a provider key and the exact `--confirm-paid` argument. It creates its own unlocked owner session and reserves quota directly; it does **not** use the browser access-code or consent form. Run it only as a trusted operator. Each invocation creates a new project and can consume another attempt.

The result is cached in protected storage and inspectable locally in SQLite. The CLI does not return a browser owner cookie, approve the model, publish a gift or place a distributable model in `public/`. Use the creator UI for visual approval and sharing. Review redistribution permissions and update [asset provenance](ASSET_PROVENANCE.md) before bundling a real output; none is currently distributed.

## Provider references

The original integration review was recorded on **2026-09-30**. These references describe that review's basis; recheck the provider documentation before changing the wire contract or conducting live verification.

- [Original generation entry](https://platform.tripo3d.ai/docs/generation) and [image-generation entry](https://platform.tripo3d.ai/docs/generate-image).
- [v2 to v3 migration](https://developers.tripo3d.ai/en/docs/migration-v2-to-v3), [image-to-model](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard), [file upload](https://developers.tripo3d.ai/en/docs/files), [task retrieval](https://developers.tripo3d.ai/en/docs/task-query), and [rate limits](https://developers.tripo3d.ai/en/docs/rate-limits).
- Animation contract reviewed 2026-10-02: [rig compatibility](https://developers.tripo3d.ai/en/docs/animations-rig-check), [rigging](https://developers.tripo3d.ai/en/docs/animations-rig), and [animation retargeting](https://developers.tripo3d.ai/en/docs/animations-retarget).
- [Tripothon S1](https://developers.tripo3d.ai/en/events/tripothon-s1); submission context is in [SUBMISSION.md](SUBMISSION.md).
