# Operations and troubleshooting

[Back to README](../README.md) · [Configuration](configuration.md) · [Architecture](ARCHITECTURE.md)

DoodleQuest runs as one Next.js web process and one Node worker on **one persistent node**. They share a SQLite database and private assets on local disk. The deployment configuration is supplied, but Docker, hosted HTTPS and backup/restore remain unverified in the [delivery record](COMPLETION.md).

## Process and storage layout

```text
Browser → HTTPS reverse proxy → Next.js web
                                  ↕
                       shared local DATA_DIR
                                  ↕
                             Node worker → Tripo

DATA_DIR/
  doodlequest.sqlite       drafts, sessions, jobs, snapshots and quotas
  doodlequest.sqlite-wal   SQLite may create WAL/SHM sidecars while running
  doodlequest.sqlite-shm
  assets/                 protected PNG and GLB files
```

The web process accepts requests and queues work. The worker advances generation jobs and retries queued file deletion, including in example mode. `npm run dev` starts both; `npm run start` starts only the web process.

Use the same absolute `DATA_DIR`, environment settings and application version for both services. Do not place SQLite on a network filesystem, expose `DATA_DIR` as static files, scale across nodes or deploy on ephemeral serverless storage. Asset authorization is enforced by the application on each request.

## Production processes

Configure the final HTTPS `APP_ORIGIN`, persistent `DATA_DIR`, credentials and quota using the [environment reference](configuration.md). Build and initialize from the repository root:

```sh
npm ci
npm run build
NODE_ENV=production npm run db:migrate
```

Run these as separately supervised processes from the same checkout:

```sh
# Web service; choose the listener port explicitly if changing the default.
NODE_ENV=production PORT=3000 npm run start
```

```sh
# Worker service; Next.js does not set NODE_ENV for this separate process.
NODE_ENV=production npm run worker
```

Terminate TLS at a reverse proxy. Owner cookies are Secure in production; use the configured HTTPS origin to verify creator persistence and mutations. Process supervision must restart both services and preserve the data directory across updates. `E2E_MOCK_PROVIDER` must be `0` in production.

### Docker Compose

The checked-in [Dockerfile](../Dockerfile) and [Compose configuration](../compose.yaml) run as UID 1000, mount the same named volume at `/data` and set `NODE_ENV=production` for both services. Prepare `.env` and the HTTPS reverse proxy, then:

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 web worker
```

Compose overrides `DATA_DIR` with `/data`. Keep `PORT=3000` to match the container and loopback host mapping. If replacing the named volume with a bind mount, provide write permission for UID 1000. The database initializes idempotently when either process imports it; no separate migration container is required for the current schema.

After startup, verify `/`, `/example` and `/api/mode` through the HTTPS origin. `/api/mode` reports configuration, not worker health or a successful provider connection. Use a procedural draft to verify save/reload, approval, publication in a separate browser context, revocation and deletion. Complete the live smoke test separately if enabling paid generation.

## Backup and restore

Back up the **database and assets together**. A copy of the SQLite main file alone while WAL writes are active is insufficient. For a simple maintenance-window backup:

1. Stop web and worker, preventing new requests and generation writes.
2. Snapshot or copy the entire persistent data directory or named volume, including any SQLite sidecars, while both services remain stopped.
3. Store that backup privately, then restart both services with the same configuration.
4. Test restoration into an isolated instance with matching code. Check database readability and referenced asset availability before accepting writes.

A backup contains private drawings, notes, session records and gift tokens. Keep restored instances isolated, disable paid generation during inspection, and review any pending or uncertain jobs before re-enabling a worker with credentials. Restoring an older snapshot also restores its older quota and revocation state; reconcile these before exposing it to recipients.

These are operational requirements, not a tested backup tool bundled with the project. Record a successful restore exercise before claiming recovery readiness.

## Generation recovery

Inspect the creator's generation status and provenance first. The provider status and local job status describe different stages; a provider success does not mean a validated local model is ready.

| Local state                       | Meaning                                                                        | Action                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`, `uploading`            | Waiting for the worker or uploading the drawing.                               | Check that the worker is running with the same `DATA_DIR` and provider configuration. Safe upload failures retry with backoff.                                                   |
| `submitting`                      | A request may be reaching the provider.                                        | Allow the worker to finish. After interruption without a saved task ID, recovery marks it `uncertain`.                                                                           |
| `queued`, `generating`, `polling` | A provider task ID is known. Unknown provider statuses also remain in polling. | Keep the worker running; it retrieves that same task. A refresh or restart does not resubmit.                                                                                    |
| `downloading`, `asset_retry`      | The provider finished; local download or GLB validation is pending or failed.  | Inspect the recorded error, reviewed CDN allowlist, disk permissions and asset budgets. The worker retrieves fresh output URLs and retries delivery without creating a new task. |
| `ready`                           | A validated model is stored locally.                                           | Load it in the creator preview and approve it. A preview failure does not regenerate.                                                                                            |
| `failed`                          | The provider rejected or failed the task.                                      | Review the error before explicitly requesting another paid attempt.                                                                                                              |
| `uncertain`                       | Submission may have consumed credits, but no task ID was saved.                | Check the Tripo console before authorizing another attempt. There is no automatic resubmission or provider-side idempotency lookup.                                              |

Worker claims use 120-second leases, so restart recovery can wait for an outstanding lease to expire. Error backoff reaches five minutes, or longer when provider retry headers require it. `POLL_INTERVAL_MS` is the normal polling interval, not a guarantee that every retry runs at that cadence. Displayed percentages come only from the provider. Drawing replacement is blocked while a job remains active, including `asset_retry`.

## Troubleshooting

| Symptom                                                           | Check or recovery                                                                                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creator actions return “This action must come from this website.” | Match the browser scheme, hostname and port to `APP_ORIGIN`. Restart after configuration changes. Use `localhost` consistently instead of switching to `127.0.0.1`.                     |
| Creator session expired or drafts disappeared                     | Use the original browser/profile and cookie. Owner sessions last 90 days; there is no recovery via the creator access code. An expired or lost cookie cannot reclaim its drafts.        |
| “The host has not configured creator access.”                     | Set `CREATOR_ACCESS_CODE` on the server and restart the web process. Keep web and worker settings consistent.                                                                           |
| Quota reached                                                     | Both lifetime session and installation counts apply. Failed/uncertain attempts and deleted projects still count. Review usage before intentionally changing the host's cap.             |
| A generic request failure after moving data                       | Confirm both processes resolve the same `DATA_DIR`, the directory is writable and its database and assets were moved together.                                                          |
| Generation never advances                                         | Confirm the separate worker is running. Inspect its logs and the recovery table; a page returning 200 is not worker health evidence.                                                    |
| Gift publication was not confirmed                                | Use **Check saved gift links** in the wrapping dialog. It checks existing snapshots without another publication request. A closed dialog does not revoke an already saved gift.         |
| Copying the gift link fails                                       | Select and copy the read-only link manually. The UI reports success only after the clipboard operation resolves.                                                                        |
| Deleting a project returns a busy-worker message                  | Wait for the current worker lease to finish or expire, then retry. Access is removed transactionally on deletion; failed file unlinks remain queued for the worker.                     |
| Model or WebGL fails to load                                      | Use the readable alternative, try low rendering quality, and inspect model validation or browser errors. Reloading the preview does not start generation.                               |
| Port 3107 is occupied during browser tests                        | Stop the conflicting service you own before testing. The isolated harness intentionally refuses to reuse an existing server. See [Contributing](CONTRIBUTING.md#verification-workflow). |

### Animation recovery

The workshop's **Check animation status** button only reads the saved motion job. Its stage identifies compatibility checking, rigging, or animation. The same pending/queued/polling/asset-retry/failed/uncertain rules apply to each stage, and earlier successful stages are retained. `unsupported` is terminal and preserves the original hero. On an explicit retry of a failed or uncertain stage, only that stage and its remaining successors are requested again; review uncertain submissions in the provider console first.

The current hero remains usable while motion is pending or unsuccessful. A successful replacement needs approval again. If local validation cannot recognize the expected clips, investigate the saved output and error before changing clip mappings; do not regenerate automatically. Never infer live rigging quality from the authored test fixture.

## Live smoke test

**Not run in the recorded delivery.** Use this checklist to collect actual provider evidence after reviewing current pricing and configuring credentials.

1. Configure key, creator code, model, exact origin and quota, with `E2E_MOCK_PROVIDER=0`. Start web and worker against the same data directory. Use the repository drawing for the first run, not private personal artwork.
2. Upload `public/sample-drawing.png` through **Choose a drawing**. The quick Pip sample button deliberately selects procedural geometry and will not demonstrate Tripo generation. Save, consent, unlock and submit once. Record the task ID, never the key.
3. Refresh the browser and restart the worker while polling. Verify the same task ID and exactly one provider submission/charge using the provider's records.
4. Verify provider success, the reviewed output host, copied GLB budgets, browser loading, forward adjustment, approval and full gameplay with that actual model. Local asset failure must not regenerate.
5. Publish a snapshot, open it in a separate recipient browser context, complete the adventure and capture actual provenance and gameplay. Verify revocation and project deletion.
6. Update [COMPLETION.md](COMPLETION.md) and [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) only with observed results. Review redistribution permissions before committing any generated model or evidence containing personal artwork.

Mock tests, configuration responses and the bundled procedural hero do not establish a successful paid generation, billing behavior or deployed acceptance.

For a separately authorized live animation check, use **Bring my hero to life** on the resulting model. Record the compatibility, rig, and retarget IDs and actual credits. Reload during a stage and confirm task reuse. Inspect idle/walk/celebration, orientation, ground contact, pause and reduced motion, then approve and play the complete shared gift. Verify that an older gift still uses its original model. This live animation check has not been performed in the recorded delivery.
