import { config } from "dotenv";
import path from "node:path";
import { appOrigin } from "./origin";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
export const env = {
  databaseUrl: process.env.DATABASE_URL || "",
  vercel: process.env.VERCEL === "1",
  data: path.resolve(
    /* turbopackIgnore: true */ process.env.DATA_DIR || "data",
  ),
  origin: appOrigin(),
  key: process.env.TRIPO_API_KEY || "",
  model: process.env.TRIPO_MODEL || "v3.1-20260211",
  code: process.env.CREATOR_ACCESS_CODE || "",
  quota: Number(process.env.GENERATION_QUOTA || 10),
  assetBudget: Number(
    process.env.ASSET_STORAGE_BUDGET_BYTES || 200 * 1024 * 1024,
  ),
  uploadMaxBytes: Math.min(
    Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024),
    process.env.VERCEL === "1" ? 4 * 1024 * 1024 - 64 * 1024 : 10 * 1024 * 1024,
  ),
  mock:
    process.env.E2E_MOCK_PROVIDER === "1" &&
    process.env.NODE_ENV !== "production",
  production: process.env.NODE_ENV === "production",
  hosts: (process.env.TRIPO_ASSET_HOSTS || "cdn.tripo3d.ai")
    .split(",")
    .map((s) => s.trim()),
  poll: Number(process.env.POLL_INTERVAL_MS || 5000),
};
if (
  process.env.E2E_MOCK_PROVIDER === "1" &&
  process.env.NODE_ENV === "production"
)
  throw new Error("Mock provider is forbidden in production");
export const mode = () => (env.mock ? "mock" : env.key ? "live" : "example");
if (!Number.isSafeInteger(env.quota) || env.quota < 0 || env.quota > 10000)
  throw new Error("GENERATION_QUOTA must be an integer from 0 to 10000.");
if (!Number.isSafeInteger(env.poll) || env.poll < 500 || env.poll > 60000)
  throw new Error("POLL_INTERVAL_MS must be an integer from 500 to 60000.");
if (
  !Number.isSafeInteger(env.assetBudget) ||
  env.assetBudget < 1 ||
  env.assetBudget > 2 * 1024 * 1024 * 1024
)
  throw new Error(
    "ASSET_STORAGE_BUDGET_BYTES must be between 1 byte and 2 GiB.",
  );
if (!Number.isSafeInteger(env.uploadMaxBytes) || env.uploadMaxBytes < 1)
  throw new Error("UPLOAD_MAX_BYTES must be a positive integer.");
