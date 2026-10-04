# Operations and troubleshooting

[Back to README](../README.md) · [Configuration](configuration.md) · [Architecture](ARCHITECTURE.md)

DoodleQuest targets [Vercel + Neon](VERCEL.md). Next.js serves the app, Vercel Workflows advances generation and motion jobs, and PostgreSQL stores both application records and private PNG/GLB bytes. Hosted setup, hosted HTTPS acceptance and backup/restore remain unverified; local checks do not establish that a Neon deployment is working.

## Process and storage layout

```text
Browser → Vercel Next.js → Neon PostgreSQL
                  ↓                ↕
          Vercel Workflow → Node.js step → Tripo
```

The web app commits each job and its quota reservation before dispatching a workflow for that job ID. Workflow steps claim fenced database leases, save provider task IDs and poll known tasks. Owner status requests can recover missed dispatches or stopped runs. Private assets remain behind application authorization; do not expose database dumps or asset payloads as static files.

Without `DATABASE_URL`, local development uses embedded PostgreSQL (PGlite) under `DATA_DIR/postgres`. `npm run dev` starts the Next.js app with local Workflow execution; it no longer starts a separate worker. PGlite is for one process only. A concurrently running web app and standalone `npm run worker` must use the same external `DATABASE_URL`, not the same embedded database directory. Vercel rejects a missing `DATABASE_URL` instead of falling back to ephemeral local storage.

## Hosted setup and checks

Follow [Vercel + Neon deployment](VERCEL.md) and the [environment reference](configuration.md). Use Node.js 24, the Next.js framework preset and `npm run build`. Connect a dedicated Neon database through Vercel Storage. Vercel manages request and Workflow execution; do not launch the standalone worker or Render supervisor there.

Start the hosted example with `GENERATION_QUOTA=0`, no Tripo key, and `E2E_MOCK_PROVIDER=0`. Keep the database connection string encrypted and server-only. Use a separate database or Neon branch for preview writes. Omit `APP_ORIGIN` to derive the appropriate Vercel production or preview hostname, or set the exact HTTPS origin for a custom domain.

Database initialization is lazy, idempotent and protected by a PostgreSQL advisory lock; the build does not connect to the database. `npm run db:migrate` can initialize the configured database explicitly. Do not point maintenance commands or local verification at an unrelated database.

After deployment, verify `/`, `/example`, `/api/health` and `/api/mode` through the HTTPS origin. Health checks database connectivity; the mode endpoint reports example/live configuration and upload limits. Neither proves that Workflow execution or Tripo is working. Use a procedural draft to verify save/reload, approval, publication in a separate browser context, asset persistence, revocation and deletion. Record these hosted results before claiming deployment acceptance.

Use Vercel function and Workflow logs for dispatch or job failures, and Neon monitoring for database storage and transfer. The default 200 MiB asset budget limits payloads only, not total database size or bandwidth. Generation remains separately authorized and should reuse existing provider tasks whenever possible.

### Optional standalone operator worker

`npm run worker` remains available for a trusted operator, including for a job queued by `sample:generate`. If the web app is also running, both must use the same external `DATABASE_URL`, provider settings and application version. Set `NODE_ENV=production` explicitly for a production standalone worker; `tsx` does not set it automatically. For an embedded local database, stop the web app and other database users before running the worker, and stop the worker before reopening the app.

The earlier local SQLite database and asset directory are left untouched. This branch does not import them into PostgreSQL automatically. Do not treat old local gift links or generated assets as present in a newly deployed database.

## Backup and restore

Back up the **complete PostgreSQL database**, including `asset_blobs`, gift snapshots, sessions, job/task IDs and quota history. Use a database-consistent dump or a supported provider backup; copying Vercel files is not a backup. For a restore exercise:

1. Prevent application and Workflow writes if the chosen backup method requires a maintenance window.
2. Capture all tables and store the backup privately.
3. Restore into an isolated database with matching code and provider credentials disabled.
4. Verify draft/snapshot readability and referenced asset bytes before accepting writes or enabling generation.

A backup contains private drawings, notes, session records and gift tokens. Review pending or uncertain jobs and recorded provider task IDs before enabling execution with credentials. Restoring an older snapshot also restores its older quota and revocation state; reconcile these before exposing it to recipients. For local PGlite, stop its sole process before copying or restoring its complete database directory.

These are operational requirements, not a tested backup tool bundled with the project. Record a successful restore exercise before claiming recovery readiness.

## Generation recovery

Inspect the creator's generation status and provenance first. The provider status and application job status describe different stages; a provider success does not mean a validated, stored model is ready.

| Local state                       | Meaning                                                                          | Action                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending`, `uploading`            | Waiting for execution or uploading the drawing.                                  | Check Workflow dispatch and step logs. Reopen the owner draft to recover dispatch. Safe upload failures retry with backoff.                                                          |
| `submitting`                      | A request may be reaching the provider.                                          | Allow the worker to finish. After interruption without a saved task ID, recovery marks it `uncertain`.                                                                               |
| `queued`, `generating`, `polling` | A provider task ID is known. Unknown provider statuses also remain in polling.   | Workflow steps retrieve that same task. A refresh or execution restart does not resubmit.                                                                                            |
| `downloading`, `asset_retry`      | The provider finished; download, GLB validation or storage is pending or failed. | Inspect the recorded error, reviewed CDN allowlist, database connectivity and asset budgets. Execution retrieves fresh output URLs and retries delivery without creating a new task. |
| `ready`                           | A validated model is stored in PostgreSQL.                                       | Load it in the creator preview and approve it. A preview failure does not regenerate.                                                                                                |
| `failed`                          | The provider rejected or failed the task.                                        | Review the error before explicitly requesting another paid attempt.                                                                                                                  |
| `uncertain`                       | Submission may have consumed credits, but no task ID was saved.                  | Check the Tripo console before authorizing another attempt. There is no automatic resubmission or provider-side idempotency lookup.                                                  |

Worker claims use 120-second leases, so restart recovery can wait for an outstanding lease to expire. Dispatch uses a 60-second claim for an uncertain enqueue and rechecks a recorded run after five minutes. Owner status polling can recover a missed start or a stopped run; it does not authorize a new paid attempt. Each workflow is bounded to 720 advances of the same job. Error backoff reaches five minutes, or longer when provider retry headers require it. `POLL_INTERVAL_MS` is the normal polling interval, not a guarantee that every retry runs at that cadence. Displayed percentages come only from the provider. Drawing replacement is blocked while a job remains active, including `asset_retry`.

## Troubleshooting

| Symptom                                                           | Check or recovery                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creator actions return “This action must come from this website.” | Match the browser scheme, hostname and port to the configured or platform-derived origin. Redeploy after hosted configuration changes. Locally, use `localhost` consistently instead of switching to `127.0.0.1`.           |
| Creator session expired or drafts disappeared                     | Use the original browser/profile and cookie. Owner sessions last 90 days; there is no recovery via the creator access code. An expired or lost cookie cannot reclaim its drafts.                                            |
| “The host has not configured creator access.”                     | For authorized live use, set `CREATOR_ACCESS_CODE` in the server environment and redeploy or restart. Keep any standalone worker settings consistent.                                                                       |
| Quota reached                                                     | Both lifetime session and installation counts apply. Failed/uncertain attempts and deleted projects still count. Review usage before intentionally changing the host's cap.                                                 |
| A generic request failure after changing databases                | Confirm the intended `DATABASE_URL` is configured and reachable, schema initialization succeeded, and the full database includes its asset bytes. Old SQLite data is not imported automatically.                            |
| Generation never advances                                         | Inspect Vercel Workflow and function logs, then reopen the owner draft to recover dispatch. Check the saved state before any explicit retry; a healthy web page does not prove job execution.                               |
| Gift publication was not confirmed                                | Use **Check saved gift links** in the wrapping dialog. It checks existing snapshots without another publication request. A closed dialog does not revoke an already saved gift.                                             |
| Copying the gift link fails                                       | Select and copy the read-only link manually. The UI reports success only after the clipboard operation resolves.                                                                                                            |
| Deleting a project returns a busy-worker message                  | Wait for the current step or active motion job to finish, or for an interrupted lease to expire, then retry. Project records, gift access and stored asset bytes are removed transactionally.                               |
| Upload is rejected or model storage is full                       | Check `/api/mode` for the upload limit. Vercel uploads are below 4 MiB with reserved multipart overhead; the asset payload budget is separate. Delete unused projects or review database capacity before increasing limits. |
| Model or WebGL fails to load                                      | Use the readable alternative, try low rendering quality, and inspect model validation or browser errors. Reloading the preview does not start generation.                                                                   |
| Port 3107 is occupied during browser tests                        | Stop the conflicting service you own before testing. The isolated harness intentionally refuses to reuse an existing server. See [Contributing](CONTRIBUTING.md#verification-workflow).                                     |

### Animation recovery

The workshop's **Check animation status** button retrieves the saved motion job and can recover execution of that same active job. It does not create a new attempt. Its stage identifies compatibility checking, rigging, or animation. The same pending/queued/polling/asset-retry/failed/uncertain rules apply to each stage, and earlier successful stages are retained. `unsupported` is terminal and preserves the original hero. On an explicit retry of a failed or uncertain stage, only that stage and its remaining successors are requested again; review uncertain submissions in the provider console first.

The current hero remains usable while motion is pending or unsuccessful. A successful replacement needs approval again. If local validation cannot recognize the expected clips, investigate the saved output and error before changing clip mappings; do not regenerate automatically. Never infer live rigging quality from the authored test fixture.

## Live smoke test

**Status reconciled 2026-10-03:** two live Tripo image-to-model jobs succeeded, and their validated models loaded and completed the local adventure. The second model was also published and played in a separate local recipient browser, then reused for the corrected Tripothon S1 walkthrough without another generation. See [the dated verification record](COMPLETION.md#tripothon-s1-evidence-reconciliation--2026-10-03) for scope. Live rigging, deployment and live-generated-asset revocation/deletion acceptance remain unverified.

The checklist below describes a future separately authorized run; preparing the submission packet does not require another paid generation. Review current pricing and the remaining quota before any new attempt. Existing saved models and known task IDs should be reused for evidence and recovery.

1. Configure key, creator code, model, origin and quota in the authorized environment, with `E2E_MOCK_PROVIDER=0`. Verify database and Workflow execution first. Any concurrent standalone worker must use the same external `DATABASE_URL`. Use the repository drawing for the first run, not private personal artwork.
2. Upload `public/sample-drawing.png` through **Choose a drawing**. The quick Pip sample button deliberately selects procedural geometry and will not demonstrate Tripo generation. Save, consent, unlock and submit once. Record the task ID, never the key.
3. Refresh the browser during polling and verify recovery from an execution interruption in a controlled test. Verify the same task ID and exactly one provider submission/charge using the provider's records.
4. Verify provider success, the reviewed output host, copied GLB budgets, browser loading, forward adjustment, approval and full gameplay with that actual model. Local asset failure must not regenerate.
5. Publish a snapshot, open it in a separate recipient browser context, complete the adventure and capture actual provenance and gameplay. Verify revocation and project deletion.
6. Update [COMPLETION.md](COMPLETION.md) and [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) only with observed results. Review redistribution permissions before committing any generated model or evidence containing personal artwork.

Mock tests, configuration responses and the bundled procedural hero do not establish a successful paid generation, billing behavior or deployed acceptance.

For a separately authorized live animation check, use **Bring my hero to life** on the resulting model. Record the compatibility, rig, and retarget IDs and actual credits. Reload during a stage and confirm task reuse. Inspect idle/walk/celebration, orientation, ground contact, pause and reduced motion, then approve and play the complete shared gift. Verify that an older gift still uses its original model. This live animation check has not been performed in the recorded delivery.
