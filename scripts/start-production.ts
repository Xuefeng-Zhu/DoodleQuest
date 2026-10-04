import { createRequire } from "node:module";
import { config } from "dotenv";
import {
  prepareProductionEnvironment,
  superviseProduction,
} from "../src/server/production-runtime";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const require = createRequire(import.meta.url);

try {
  const environment = prepareProductionEnvironment(process.env);
  Object.assign(process.env, environment);
  if (!process.env.DATABASE_URL)
    throw new Error("The standalone production web/worker pair requires DATABASE_URL.");
  const { ready, closeDatabase } = await import("../src/server/db");
  await ready();
  await closeDatabase();
  process.exitCode = await superviseProduction(
    [
      {
        name: "Next.js",
        args: [
          require.resolve("next/dist/bin/next"),
          "start",
          "--hostname",
          "0.0.0.0",
        ],
      },
      {
        name: "Worker",
        args: ["--import", "tsx", "src/server/worker-entry.ts"],
      },
    ],
    { environment },
  );
} catch (error) {
  console.error(
    "Production startup failed:",
    error instanceof Error ? error.message : "Unable to initialize runtime.",
  );
  process.exitCode = 1;
}
