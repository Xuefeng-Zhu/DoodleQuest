import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const env = {
  ...process.env,
  DATA_DIR: mkdtempSync(join(tmpdir(), "doodlequest-e2e-")),
  APP_ORIGIN: "http://localhost:3107",
  PORT: "3107",
  E2E_MOCK_PROVIDER: "1",
  TRIPO_API_KEY: "",
  DATABASE_URL: "",
  CREATOR_ACCESS_CODE: "test-only-code",
  GENERATION_QUOTA: "100",
  POLL_INTERVAL_MS: "500",
  NEXT_DIST_DIR: ".next-e2e",
  WORKFLOW_LOCAL_DATA_DIR: mkdtempSync(join(tmpdir(), "doodlequest-workflows-")),
};
const p = spawn("npm", ["run", "dev"], { stdio: "inherit", env });
process.on("SIGTERM", () => p.kill("SIGTERM"));
process.on("SIGINT", () => p.kill("SIGTERM"));
p.on("exit", (c) => process.exit(c ?? 0));
