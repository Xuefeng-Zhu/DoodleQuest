# Contributing to DoodleQuest

Start with the [README](../README.md) for local setup and the product overview. Read [Architecture](ARCHITECTURE.md) before changing the creator flow, worker, storage or game state. The [configuration reference](configuration.md) describes environment variables, and [operations](operations.md) covers the persistent web/worker deployment.

## Before changing code

1. Inspect `git status` and the existing diff so you can preserve unrelated work.
2. Fetch `origin`. Fast-forward the local base branch only when the working tree and branch state make that safe; do not reset local commits or overwrite changes to force a sync.
3. Use a focused branch, with `codex/` for agent-created branches by default. If creating a worktree, copy the matching non-versioned `.env*` files from the main/master checkout before local app or authentication verification. Keep their contents out of logs and commits. Review `DATA_DIR` so a worktree does not unintentionally share another checkout's runtime storage.
4. Run `npm ci` with Node 24, matching the Docker runtime. Keep dependency changes and the lockfile consistent.
5. Read the relevant guide shipped with the installed Next.js version in `node_modules/next/dist/docs/`. This repository uses Next.js 16.3.8; older examples can describe different APIs. Follow [AGENTS.md](../AGENTS.md).

For a fresh checkout without existing local environment files, follow the README's `.env.example` setup. Keep the default example mode for ordinary development; the playable procedural Pip sample needs no provider credentials.

## Commands

Run these from the repository root. The definitions live in [package.json](../package.json).

| Command                                     | Purpose and side effects                                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                               | Starts both Next.js and the durable worker. Use the configured `APP_ORIGIN`, normally `http://localhost:3000`.                                                                                                              |
| `npm run dev:web`                           | Starts only the development web process, bound to `127.0.0.1`. Generation jobs need a separate worker.                                                                                                                      |
| `npm run worker`                            | Runs the worker against the configured `DATA_DIR`; pending live jobs can contact Tripo.                                                                                                                                     |
| `npm run db:migrate`                        | Applies the idempotent SQLite schema migration to the configured data directory.                                                                                                                                            |
| `npm run db:seed`                           | Recreates `public/sample-drawing.png` from the repository SVG and migrates the database. It makes no provider call.                                                                                                         |
| `npm test`                                  | Runs the Vitest unit and server tests once.                                                                                                                                                                                 |
| `npx next typegen`                          | Generates Next.js route types before typechecking, without a production build.                                                                                                                                              |
| `npm run typecheck`                         | Runs `tsc --noEmit`; it does not generate the Next.js types first.                                                                                                                                                          |
| `npm run test:e2e`                          | Starts an isolated local web/worker runtime and runs Chromium browser tests. See the isolation and evidence notes below.                                                                                                    |
| `npm run build`                             | Builds the production application.                                                                                                                                                                                          |
| `npm run start`                             | Serves the existing production build on `0.0.0.0`; run the worker separately with the same storage.                                                                                                                         |
| `npm run demo:record`                       | Records a running app, creates a fictional draft and publishes a local gift link in that instance, then writes evidence.                                                                                                    |
| `npm run demo:reveal`                       | Records the running app's bundled `/example` recipient reveal and writes evidence; it performs no creator or generation writes.                                                                                             |
| `npm run sample:generate -- --confirm-paid` | Queues one potentially paid Tripo sample attempt using the repository drawing. This requires credentials and explicit intent to spend credits; it is not a routine verification command. Run the worker to process the job. |

The recording commands use `DEMO_BASE_URL`, defaulting to `http://localhost:3000`, and require a separately running app. Review the target before recording, particularly because `demo:record` writes a real draft and gift snapshot. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md), [REVEAL.md](REVEAL.md) and [asset provenance](ASSET_PROVENANCE.md).

The scripts produce WebM recordings. To create the MP4 counterpart after a successful full walkthrough, install FFmpeg separately and run:

```sh
ffmpeg -y -i evidence/walkthrough.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart evidence/walkthrough.mp4
```

This replaces the existing MP4. Use `reveal-walkthrough` in both paths for the reveal recording. Review new footage before replacing committed evidence; the original walkthrough predates several later features.

## Verification workflow

Choose checks that exercise the changed behavior. For an application change, the normal baseline is:

```sh
npm test
npx next typegen
npm run typecheck
npm run build
git diff --check
```

Add the affected browser suites for interface changes or changes crossing the web/worker/storage boundary. Run the full browser suite when a change affects shared progression, owner sessions, gift snapshots, protected assets or generation behavior. A documentation-only change generally needs command/path/link review, formatting and `git diff --check`, rather than a fresh product test run.

On a clean checkout, generated route declarations may be absent even though `next-env.d.ts` references them. Run `npx next typegen` before typechecking. Next.js also regenerates these declarations during development and builds. It manages `next-env.d.ts`, which is currently tracked here and can change when switching between development, production and the E2E output directory. Inspect the diff, preserve pre-existing work and do not hand-edit generated imports to hide missing types. The installed CLI guidance is in `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`.

There is currently no `lint` npm script. For Markdown edits, use the installed formatter on only the changed files:

```sh
npx prettier --check README.md docs/CONTRIBUTING.md
```

Replace the file list with the files you changed; use `--write` to apply formatting. Avoid a repository-wide formatting pass as part of an unrelated fix.

### Focused tests

Vitest selects `tests/**/*.test.ts`; Playwright selects `tests/*.e2e.ts`. Pass filenames after `--` to limit a run:

```sh
# Domain progression and server reliability
npm test -- tests/quest.test.ts tests/server.test.ts

# A particular recipient feature
npm test -- tests/letter.test.ts
npm run test:e2e -- tests/letter.e2e.ts

# Creator publication and recipient ownership regression
npm run test:e2e -- tests/wrapping.e2e.ts tests/adventure.e2e.ts

# Inspect matching browser cases without starting the test runtime
npm run test:e2e -- --list
```

| Changed area                                                     | Relevant coverage                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Quest rules and progression                                      | `quest.test.ts`, `adventure.e2e.ts`, `fallback.e2e.ts`                                            |
| Sessions, uploads, snapshots, generation jobs and Tripo contract | `server.test.ts`, `adventure.e2e.ts`                                                              |
| Reveal, celebrations, letter, dedication, wonders or melody      | Matching `*.test.ts` and `*.e2e.ts`; include `fallback.e2e.ts` when changing the text alternative |
| Gift wrapping and publication recovery                           | `wrapping.e2e.ts`, plus the creator/share lifecycle in `adventure.e2e.ts`                         |

All paths in this table are under `tests/`. Add regression coverage for meaningful new behavior or a fixed failure; preserve authorization, immutable-snapshot and progression assertions when adjusting test timing.

### Browser runtime isolation

Install the browser once if needed:

```sh
npx playwright install chromium
npm run test:e2e
```

[playwright.config.ts](../playwright.config.ts) runs one worker, does not reuse an existing server and launches [scripts/test-server.ts](../scripts/test-server.ts). The launcher sets:

- A fresh `doodlequest-e2e-*` directory under the OS temporary directory for SQLite and private assets.
- `APP_ORIGIN=http://localhost:3107` and `PORT=3107`.
- `NEXT_DIST_DIR=.next-e2e` so test build output is separate from the normal `.next` directory.
- An empty `TRIPO_API_KEY`, `E2E_MOCK_PROVIDER=1`, a test-only creator code, quota 100 and 500 ms polling.

Do not start your own server on port 3107 or run multiple browser suites concurrently in the same checkout. Stop the existing process you own before retrying a port conflict. The temporary test database is separate from your normal drafts; the launcher does not delete its temporary directory afterward. If cleaning it up, identify the exact directory for the completed run and ensure no process still uses it.

Unit tests also use a fresh `doodlequest-unit-*` temporary data directory through [tests/setup.ts](../tests/setup.ts). The server contract tests mock provider responses. Neither unit nor browser tests establish live Tripo generation or billing behavior.

### Evidence and reports

Browser tests record video and retain traces on failure. Inspect the HTML report with:

```sh
npx playwright show-report
```

`playwright-report/`, `test-results/`, `.next/`, `.next-e2e/` and `evidence/recording-raw/` are ignored. **Several browser tests and both recording scripts also overwrite named screenshots, logs, audio or metrics in the versioned `evidence/` directory.** Review `git status` and those diffs after a run. Keep intentional, reviewed evidence; do not bulk-stage changed captures or discard evidence that was already present before your work.

When recording verification in [COMPLETION.md](COMPLETION.md), state the actual command or selected suites, date, result, runtime and unverified layers. Preserve older entries as historical results. Distinguish:

- Unit/contract tests from browser behavior.
- Procedural Pip and explicitly mocked GLBs from live Tripo output.
- Emulated viewport/touch and SwiftShader measurements from physical-device performance.
- Browser audio-graph output from physical speaker playback.
- A local production build from deployed HTTPS, Docker, backup/restore or production operation.

Inspect relevant screenshots and logs when a visual change is part of the request. A passing assertion alone does not establish readable layout or acceptable animation.

## Commits and review

Commit progressively in focused milestones, after the relevant checks pass. Stage explicit paths and inspect the staged diff. Keep credentials, `.env` files, runtime databases/uploads, dependencies and generated build/test output out of commits. The placeholder-only `.env.example` and intentionally reviewed product evidence may be committed.

Describe the concrete behavior change, how it was verified and any remaining limitations in the pull request. Create ready-for-review PRs by default; use a draft only when requested or when a known blocker makes review inappropriate. Update the README or the appropriate reference guide when changing setup, commands, configuration or operational behavior.
