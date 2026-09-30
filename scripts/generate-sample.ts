import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { env } from "../src/server/env";
import { db } from "../src/server/db";
import { sessions, projects } from "../src/server/schema";
import { newProject, requestGeneration } from "../src/server/repository";
import { saveAsset } from "../src/server/storage";
import { digest, token, owned } from "../src/server/security";
if (!env.key)
  throw new Error("TRIPO_API_KEY required. No sample generation attempted.");
if (process.argv[2] !== "--confirm-paid")
  throw new Error(
    "This sends the original repository Pip drawing to Tripo and may consume credits. Run npm run sample:generate -- --confirm-paid to authorize one attempt.",
  );
const owner = digest(token()),
  now = Date.now();
db.insert(sessions)
  .values({
    id: owner,
    createdAt: now,
    expiresAt: now + 90 * 24 * 3600_000,
    unlocked: 1,
  })
  .run();
const p = newProject(owner);
const inputAsset = await saveAsset(
  p.id,
  "drawing",
  await readFile("public/sample-drawing.png"),
  { sample: true, source: "repository original" },
);
db.update(projects)
  .set({ inputAsset, revision: 1, source: "tripo" })
  .where(eq(projects.id, p.id))
  .run();
const job = requestGeneration(owned(p.id, owner), randomUUID());
console.log(
  `Queued paid sample attempt ${job.id}. Run npm run worker. Result will be cached in protected storage, not public/. Inspect locally in SQLite; review licensing and approval before distribution. For visual approval and sharing, use the creator UI instead.`,
);
