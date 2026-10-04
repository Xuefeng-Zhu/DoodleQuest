import { and, eq } from "drizzle-orm";
import { db, transaction } from "./db";
import { projects, type MotionJob } from "./schema";
import { motionRepository, type MotionRepository } from "./repository";
import {
  downloadModel,
  InvalidModelError,
  saveAsset,
  validateModel,
} from "./storage";
import {
  animationPresets,
  LiveTripo,
  mapStatus,
  ProviderError,
  type TripoAnimationProvider,
} from "./tripo";
import { env } from "./env";
import { resolveHeroClips } from "../domain/hero-motion";

const uncertainMessage =
  "Movement submission is uncertain and may have consumed credits. Check the Tripo console before explicitly starting another attempt. No automatic paid retry will occur.";
function taskId(j: MotionJob) {
  return j.stage === "rig_check"
    ? j.checkTask
    : j.stage === "rig"
      ? j.rigTask
      : j.retargetTask;
}
function currentHero(j: MotionJob) {
  return and(
    eq(projects.id, j.projectId),
    eq(projects.owner, j.owner),
    eq(projects.revision, j.inputRevision),
    eq(projects.modelAsset, j.inputAsset),
    eq(projects.source, j.inputSource),
  );
}

/** Every stage persists its task ID before advancing; only known tasks may retry. */
export async function processMotionOne(
  provider: TripoAnimationProvider = new LiveTripo(),
  repo: MotionRepository = motionRepository,
  download = downloadModel,
  jobId?: string,
): Promise<boolean> {
  const j = await repo.claim(jobId);
  if (!j) return false;
  const patch = async (changes: Partial<MotionJob>) => {
    if (!(await repo.patch(j, changes))) throw new Error("Lease lost");
    Object.assign(j, changes);
  };
  try {
    if (
      !(
        await db
          .select({ id: projects.id })
          .from(projects)
          .where(currentHero(j))
          .limit(1)
      )[0]
    ) {
      await patch({
        status: "failed",
        lastError:
          "The hero changed while movement was being prepared. The newer hero was kept.",
        leaseUntil: 0,
      });
      return true;
    }
    const id = taskId(j);
    if (j.status === "submitting" && !id) {
      await patch({
        status: "uncertain",
        lastError: uncertainMessage,
        leaseUntil: 0,
      });
      return true;
    }
    if (!id) {
      await patch({ status: "submitting", attempts: j.attempts + 1 });
      let submitted: string;
      try {
        if (j.stage === "rig_check")
          submitted = await provider.rigCheck(j.generationTask);
        else if (j.stage === "rig")
          submitted = await provider.rig(j.generationTask, j.rigType!);
        else submitted = await provider.retarget(j.rigTask!, j.rigType!);
        if (!submitted)
          throw new ProviderError("No movement task ID was confirmed.");
      } catch (e) {
        const definitive = e instanceof ProviderError && e.definitive;
        await patch({
          status: definitive ? "failed" : "uncertain",
          lastError: definitive ? e.message : uncertainMessage,
          leaseUntil: 0,
        });
        return true;
      }
      await patch({
        ...(j.stage === "rig_check"
          ? { checkTask: submitted }
          : j.stage === "rig"
            ? { rigTask: submitted }
            : { retargetTask: submitted }),
        status: "queued",
        providerStatus: "queued",
        lastError: null,
        nextPoll: Date.now() + env.poll,
        leaseUntil: 0,
      });
      return true;
    }
    const task = await provider.retrieve(id);
    const status = mapStatus(task.status);
    await patch({
      status,
      providerStatus: task.status,
      progress: task.progress ?? null,
    });
    if (status === "failed") {
      await patch({
        lastError: `Tripo reported ${task.status} while preparing movement. Your original hero is still available.`,
        leaseUntil: 0,
      });
      return true;
    }
    if (status !== "downloading") {
      await patch({ nextPoll: Date.now() + env.poll, leaseUntil: 0 });
      return true;
    }
    if (j.stage === "rig_check") {
      if (
        typeof task.riggable !== "boolean" ||
        typeof task.rigType !== "string"
      ) {
        await patch({
          status: "failed",
          lastError:
            "Tripo did not return a complete compatibility result. Your original hero is still available.",
          leaseUntil: 0,
        });
        return true;
      }
      if (!task.riggable || !animationPresets(task.rigType).length) {
        await patch({
          status: "unsupported",
          rigType: task.rigType,
          lastError:
            "This drawing cannot use the supported skeletal movements. Its playful bounce, float, or sway is still available.",
          leaseUntil: 0,
        });
        return true;
      }
      await patch({
        stage: "rig",
        rigType: task.rigType,
        status: "pending",
        providerStatus: null,
        progress: null,
        nextPoll: Date.now(),
        leaseUntil: 0,
      });
      return true;
    }
    if (j.stage === "rig") {
      await patch({
        stage: "retarget",
        status: "pending",
        providerStatus: null,
        progress: null,
        nextPoll: Date.now(),
        leaseUntil: 0,
      });
      return true;
    }
    if (!task.modelUrl) {
      await patch({
        status: "failed",
        lastError:
          "Tripo finished without an animated model URL. Your original hero was kept. Another attempt requires explicit approval.",
        leaseUntil: 0,
      });
      return true;
    }
    const bytes = await download(task.modelUrl);
    let metadata: Awaited<ReturnType<typeof validateModel>>;
    try {
      metadata = await validateModel(bytes, true);
      if (!metadata.rigged || !metadata.animationClips.length)
        throw new Error(
          "The returned model has no playable skeletal animation.",
        );
      const clips = resolveHeroClips(
        metadata.animationClips.map((name) => ({ name })),
      );
      if (
        !clips.walk ||
        (j.rigType === "biped" && (!clips.idle || !clips.celebrate))
      )
        throw new Error(
          "The returned animation clip names do not include the supported hero movements.",
        );
    } catch (e) {
      // A known bad artifact cannot improve by downloading the same bytes forever.
      // Keep its paid task IDs so an explicit new attempt can reuse the completed rig.
      await patch({
        status: "failed",
        lastError: `${e instanceof Error ? e.message : "The animated model failed validation."} Your original hero was kept. Another attempt requires explicit approval.`,
        leaseUntil: 0,
      });
      return true;
    }
    await transaction(async () => {
      // Fence before storing bytes; lease and current-hero checks share the commit.
      await patch({});
      const finalAsset = await saveAsset(j.projectId, "model", bytes, {
        ...metadata,
        source: j.inputSource,
        generationTask: j.generationTask,
        providerTask: j.retargetTask,
        rigType: j.rigType,
        motionTasks: {
          check: j.checkTask,
          rig: j.rigTask,
          retarget: j.retargetTask,
        },
      });
      await patch({
        finalAsset,
        status: "ready",
        lastError: null,
        leaseUntil: 0,
      });
      const replaced = await db
        .update(projects)
        .set({ modelAsset: finalAsset, approved: 0, updatedAt: Date.now() })
        .where(currentHero(j))
        .returning({ id: projects.id });
      if (!replaced.length)
        await patch({
          status: "failed",
          lastError:
            "The hero changed while movement was being prepared. The newer hero was kept.",
        });
    });
  } catch (e) {
    if (e instanceof InvalidModelError) {
      await repo.patch(j, {
        status: "failed",
        leaseUntil: 0,
        lastError: `${e.message} Your original hero was kept. Another attempt requires explicit approval.`,
      });
      return true;
    }
    const attempts = j.attempts + 1;
    // If saving a just-submitted ID failed, retain uncertainty instead of resubmitting.
    const unknownSubmission = j.status === "submitting" && !taskId(j);
    await repo.patch(j, {
      attempts,
      status: unknownSubmission
        ? "uncertain"
        : j.providerStatus === "success"
          ? "asset_retry"
          : "polling",
      lastError: unknownSubmission
        ? uncertainMessage
        : j.providerStatus === "success"
          ? "Movement finished at Tripo. Local validation or download needs attention; no paid stage will be repeated. " +
            (e instanceof Error ? e.message : "")
          : "Connection interrupted. The worker will retry this safe step.",
      nextPoll:
        Date.now() +
        Math.max(
          e instanceof ProviderError ? e.retryAfter : 0,
          Math.min(300_000, 5000 * 2 ** Math.min(attempts, 6)),
        ),
      leaseUntil: 0,
    });
  }
  return true;
}
