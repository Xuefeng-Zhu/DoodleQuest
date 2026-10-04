# Render deployment

The deployment definition is [render.yaml](../render.yaml). It uses one native Node.js web service in Oregon and a 1 GB persistent disk mounted at `/var/data`. Both the Next.js server and durable worker run inside that service. They must share the same local SQLite database and protected asset directory; do not create a separate Render worker with another disk.

## Planned first deployment

| Setting                 | Value                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Repository              | `Xuefeng-Zhu/DoodleQuest` (private)                                                                                             |
| Branch                  | `codex/render-deployment`                                                                                                       |
| Runtime                 | Node.js 24.14.1                                                                                                                 |
| Compute                 | `0.5c-512mb`, one instance                                                                                                      |
| Build                   | `npm ci --include=dev && DATA_DIR=/tmp/doodlequest-build TRIPO_API_KEY= CREATOR_ACCESS_CODE= E2E_MOCK_PROVIDER=0 npm run build` |
| Start                   | `npm run start:production`                                                                                                      |
| Health check            | `/api/health`                                                                                                                   |
| Disk                    | 1 GB at `/var/data`                                                                                                             |
| Runtime data            | `/var/data/doodlequest`                                                                                                         |
| Automatic deploys       | Off                                                                                                                             |
| Initial generation mode | Procedural example; no provider key; generation quota zero                                                                      |

The [current pricing](https://render.com/pricing), checked October 3, 2026, lists this compute size at $7/month and persistent disks at $0.25/GB/month: **$7.25/month base infrastructure**, before tax or additional usage. Approval is required before provisioning this paid service. The larger 2 GB compute option is $25/month if actual load later requires it; no automatic upgrade is configured.

No Render service has been created yet. The Render workspace is signed in, but its Git provider connection is missing. Automatic approval review blocked opening that access-grant flow; the user must approve connecting Render to this private repository before deployment can continue.

## Local verification — October 3, 2026

The final configuration passed 113 tests across 13 files, TypeScript checking, YAML/code formatting checks, and a production Next.js build. The build needed to run outside the restricted local sandbox after the sandboxed build stalled.

An isolated production runtime with blank provider credentials passed HTTP checks for the home, example and creator pages, readiness, exact origin enforcement, secure session cookies, sample creation, approval and publication. A fresh runtime using the same temporary data directory retained the gift snapshot, drawing bytes and owner session. Revocation blocked anonymous gift and drawing access. Stopping the worker unexpectedly caused the supervisor to fail and release the web listener; normal shutdown completed cleanly.

A separate real-worker check confirmed that repeated cleanup failures make readiness unavailable, and clearing the obstruction restores readiness and processing. These checks made no provider calls. They establish local production process and persistence behavior; hosted Render storage, HTTPS/browser behavior, load capacity and backup restoration still require their own acceptance checks.

## Deployment behavior

Render supplies `RENDER_EXTERNAL_HOSTNAME`; the app derives its HTTPS origin from that hostname unless `APP_ORIGIN` explicitly overrides it. A custom domain requires setting `APP_ORIGIN` to its exact HTTPS origin. Do not configure a localhost origin for the hosted service.

The build uses temporary storage because the persistent disk is available only at runtime. Production startup verifies the origin and writable data paths, applies idempotent migrations, and supervises the web and worker processes. An unexpected child-process exit shuts down its sibling and exits unsuccessfully so Render can restart the service. Shutdown gives in-flight work a bounded opportunity to finish. Readiness checks storage, SQLite and a fresh heartbeat belonging to this worker boot; it never calls Tripo.

The tracked sample PNG already exists. Production startup does not regenerate source art, import local user data or run a paid generation. Dependencies needed by the TypeScript worker and launcher remain installed by `npm ci --include=dev`.

## After repository access and cost approval

1. Connect Render's GitHub integration to **only `Xuefeng-Zhu/DoodleQuest`** if selected-repository access is available. Review the actual permission screen before granting it.
2. Create a Blueprint from `codex/render-deployment`, or create a Node web service with the exact table above. Set the disk and environment before the first start. Do not choose Docker merely because a Dockerfile exists; the existing Compose configuration launches its worker separately.
3. Review the paid service/disk quote. Deploy the reviewed commit and wait for successful build and healthy status.
4. Verify HTTPS `/`, `/example`, `/create`, `/api/mode` and `/api/health`. Play the example, save and publish a fictional procedural gift, then open its link in a separate browser context.
5. Restart the service and confirm the same gift still loads. Exercise revocation using a separate disposable test gift. This is the acceptance check for the mounted disk, not merely a health-page check.
6. Update the submission copy with the verified public URL and record deployed commit/date and exact checks in the completion notes.

The first deployment does not contain the private runtime database or existing generated models. The recorded Mom & Dad gift is not automatically available on the new host. Importing a reviewed generated example is a separate content-publication step. Enabling new Tripo generation requires explicit approval to transfer the provider key into Render's secret environment, configure creator access and choose a nonzero quota. Never commit or expose those values in build logs or client bundles.

## Persistence and recovery

Render disks cannot be shared across services or multiple instances. Disk-backed redeploys cause a short interruption. Keep automatic deploys off during judging and deploy only reviewed commits. Back up SQLite using its backup API together with its referenced assets; do not assume a live filesystem copy of a WAL database is consistent. Disk snapshot restoration and a full application backup/restore remain unverified until exercised.

References: [persistent disks](https://render.com/docs/disks), [default environment variables](https://render.com/docs/environment-variables), [Blueprint fields](https://render.com/docs/blueprint-spec), [Node versions](https://render.com/docs/node-version).
