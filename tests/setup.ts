import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "doodlequest-unit-"));
process.env.GENERATION_QUOTA = "100";

// Unit tests must never pick up a deployed Neon URL or Vercel execution mode
// from an ignored developer .env file. The isolated local Postgres store is used.
process.env.DATABASE_URL = "";
process.env.VERCEL = "";
