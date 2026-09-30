import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "doodlequest-unit-"));
process.env.GENERATION_QUOTA = "100";
