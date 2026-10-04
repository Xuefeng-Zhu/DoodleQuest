# Render deployment status

DoodleQuest is deployed on [Vercel + Neon](VERCEL.md). No Render service was created. The earlier Render proposal used SQLite and a persistent asset disk; the current application stores its records and asset bytes in PostgreSQL.

The obsolete `render.yaml` Blueprint has been removed. It targeted the old deployment branch and did not provide the external `DATABASE_URL` now required by the standalone production launcher. Do not use that historical configuration from older commits.

A future Render deployment needs a separately reviewed configuration with an external PostgreSQL database, matching web and worker settings, an HTTPS application origin, and hosted acceptance checks. The earlier local SQLite process tests do not establish that deployment's readiness. Use the current [Vercel deployment instructions](VERCEL.md) for the supported hosted path.

## Optional Docker Compose environment

`compose.yaml` runs the web app and standalone worker against one external PostgreSQL database. Set `DATABASE_URL` in the ignored `.env` file before starting; Compose now rejects an empty value rather than starting a worker that repeatedly exits. Both services receive the same connection string. The shared `/data` volume holds local runtime files, not the application database or asset bytes.

The checked-in `.env.example` intentionally leaves `DATABASE_URL` blank. It supports single-process local development with embedded PostgreSQL, so copying it alone is insufficient for Compose. Use a dedicated database for the container environment. Docker image startup, HTTPS proxy configuration and full container acceptance remain unverified.
