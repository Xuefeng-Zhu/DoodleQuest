import { and, eq, gt, inArray } from "drizzle-orm";
import { db, transaction } from "./db";
import {
  assets,
  assetBlobs,
  projects,
  jobs,
  motionJobs,
  gifts,
  storageGc,
} from "./schema";
import { HttpError } from "./security";
import { assertNoActiveMotion } from "./repository";

// Call under the application transaction lock so references cannot change
// between finding unused image records and deleting their stored bytes.
async function reclaimDrawingAssets(
  projectId: string,
  replacingInputId?: string,
) {
  const images = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.projectId, projectId),
        inArray(assets.kind, ["drawing", "original"]),
      ),
    );
  const byId = new Map(images.map((image) => [image.id, image]));
  const referenced = new Set<string>();
  const retain = (id: string | null | undefined) => {
    if (!id) return;
    referenced.add(id);
    const image = byId.get(id);
    if (image?.kind === "drawing") {
      const originalId = JSON.parse(image.metadata).originalId;
      if (typeof originalId === "string") referenced.add(originalId);
    }
  };
  const [project] = await db
    .select({
      inputAsset: projects.inputAsset,
      modelAsset: projects.modelAsset,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (project?.inputAsset !== replacingInputId) retain(project?.inputAsset);
  retain(project?.modelAsset);
  const history = await db
    .select({ inputAsset: jobs.inputAsset, finalAsset: jobs.finalAsset })
    .from(jobs)
    .where(eq(jobs.projectId, projectId));
  const motionHistory = await db
    .select({
      inputAsset: motionJobs.inputAsset,
      finalAsset: motionJobs.finalAsset,
    })
    .from(motionJobs)
    .where(eq(motionJobs.projectId, projectId));
  for (const job of [...history, ...motionHistory]) {
    retain(job.inputAsset);
    retain(job.finalAsset);
  }
  const published = await db
    .select({ snapshot: gifts.snapshot })
    .from(gifts)
    .where(and(eq(gifts.projectId, projectId), eq(gifts.revoked, 0)));
  for (const gift of published) {
    const snapshot = JSON.parse(gift.snapshot);
    retain(snapshot.drawingAsset);
    retain(snapshot.modelAsset);
  }
  const ids = images
    .filter((image) => !referenced.has(image.id))
    .map((image) => image.id);
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

// Called inside the drawing replacement transaction: rollback restores the old
// drawing if saving its replacement fails. Active gifts and job inputs remain.
export async function reclaimReplacedDrawing(
  projectId: string,
  inputId: string | null,
) {
  if (inputId) await reclaimDrawingAssets(projectId, inputId);
}

export async function revokeGift(projectId: string, shareId: string) {
  await transaction(async () => {
    await db
      .update(gifts)
      .set({ revoked: 1 })
      .where(and(eq(gifts.id, shareId), eq(gifts.projectId, projectId)));
    // Replaced drawings are no longer reachable through the current draft;
    // revisit them here when their final live gift reference is revoked.
    await reclaimDrawingAssets(projectId);
  });
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
