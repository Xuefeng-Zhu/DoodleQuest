import { and, eq, gt, inArray } from "drizzle-orm";
import { db, transaction } from "./db";
import { assets, assetBlobs, projects, jobs, gifts, storageGc } from "./schema";
import { HttpError } from "./security";
import { assertNoActiveMotion } from "./repository";

// Called inside the drawing replacement transaction: rollback restores the old
// drawing if saving its replacement fails. Published keepsakes and job inputs
// remain available even when the creator changes the current draft.
export async function reclaimReplacedDrawing(
  projectId: string,
  inputId: string | null,
) {
  if (!inputId) return;
  const [input] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, inputId), eq(assets.projectId, projectId)));
  if (!input || input.kind !== "drawing") return;
  const originalId = JSON.parse(input.metadata).originalId as
    string | undefined;
  const referenced = new Set<string>();
  const history = await db
    .select({ inputAsset: jobs.inputAsset })
    .from(jobs)
    .where(eq(jobs.projectId, projectId));
  for (const job of history) referenced.add(job.inputAsset);
  if (referenced.has(inputId) && originalId) referenced.add(originalId);
  const published = await db
    .select({ snapshot: gifts.snapshot })
    .from(gifts)
    .where(eq(gifts.projectId, projectId));
  for (const gift of published) {
    const snapshot = JSON.parse(gift.snapshot);
    if (snapshot.drawingAsset) referenced.add(snapshot.drawingAsset);
  }
  const ids = [inputId, ...(originalId ? [originalId] : [])].filter(
    (id) => !referenced.has(id),
  );
  if (!ids.length) return;
  const removed = await db
    .delete(assets)
    .where(and(eq(assets.projectId, projectId), inArray(assets.id, ids)))
    .returning({ filename: assets.filename });
  if (removed.length)
    await db.delete(assetBlobs).where(
      inArray(
        assetBlobs.filename,
        removed.map((item) => item.filename),
      ),
    );
}

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
