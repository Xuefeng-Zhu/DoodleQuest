import { and, eq, gt, inArray } from "drizzle-orm";
import { db, transaction } from "./db";
import { assets, assetBlobs, projects, jobs, storageGc } from "./schema";
import { HttpError } from "./security";
import { assertNoActiveMotion } from "./repository";

// Compatibility drain for any already-enqueued database blob deletions.
export async function flushDeletedFiles() {
  await transaction(async () => {
    const queued = await db.select().from(storageGc);
    if (!queued.length) return;
    const filenames = queued.map((item) => item.filename);
    await db.delete(assetBlobs).where(inArray(assetBlobs.filename, filenames));
    await db.delete(storageGc).where(inArray(storageGc.filename, filenames));
  });
}

export async function deleteProject(id: string) {
  await transaction(async () => {
    await assertNoActiveMotion(id);
    const [busy] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.projectId, id), gt(jobs.leaseUntil, Date.now())))
      .limit(1);
    if (busy)
      throw new HttpError(
        409,
        "The worker is finishing a step. Try deleting again in two minutes.",
      );
    const list = await db
      .select({ filename: assets.filename })
      .from(assets)
      .where(eq(assets.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
    if (list.length) {
      const filenames = list.map((item) => item.filename);
      await db
        .delete(assetBlobs)
        .where(inArray(assetBlobs.filename, filenames));
      await db.delete(storageGc).where(inArray(storageGc.filename, filenames));
    }
  });
}
