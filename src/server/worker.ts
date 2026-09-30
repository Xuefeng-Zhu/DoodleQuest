import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { projects, jobs } from "./schema";
import { repository, type GenerationRepository } from "./repository";
import {
  asset,
  storage,
  saveAsset,
  downloadModel,
  validateModel,
} from "./storage";
import {
  LiveTripo,
  ProviderError,
  mapStatus,
  type TripoProvider,
} from "./tripo";
import { env } from "./env";
export async function processOne(
  provider: TripoProvider = new LiveTripo(),
  repo: GenerationRepository = repository,
  download = downloadModel,
) {
  const j = repo.claim();
  if (!j) return false;
  const patch = (v: Parameters<typeof repo.patch>[1]) => {
    if (!repo.patch(j, v)) throw new Error("Lease lost");
    Object.assign(j, v);
  };
  try {
    if (j.status === "submitting" && !j.providerId) {
      patch({
        status: "uncertain",
        lastError:
          "A previous submission ended before the task ID was saved. It may have consumed credits. Check the Tripo console before explicitly starting a new attempt.",
        leaseUntil: 0,
      });
      return true;
    }
    if (!j.providerId) {
      if (!j.uploadToken) {
        patch({ status: "uploading" });
        const input = await storage.read(asset(j.inputAsset).filename);
        const uploadToken = await provider.upload(input);
        patch({ uploadToken });
      }
      patch({ status: "submitting", attempts: j.attempts + 1 });
      let providerId: string;
      try {
        providerId = await provider.create(j.uploadToken!, j.model);
      } catch (e) {
        const error =
          e instanceof ProviderError
            ? e
            : new ProviderError("No task ID was confirmed.");
        patch({
          status: error.definitive ? "failed" : "uncertain",
          lastError: error.definitive
            ? error.message
            : "Submission is uncertain and may have consumed credits. Check the Tripo console. No automatic retry will occur.",
          leaseUntil: 0,
        });
        return true;
      }
      patch({
        providerId,
        status: "queued",
        providerStatus: "queued",
        lastError: null,
        nextPoll: Date.now() + env.poll,
        leaseUntil: 0,
      });
      return true;
    }
    const task = await provider.retrieve(j.providerId);
    const status = mapStatus(task.status);
    patch({
      providerStatus: task.status,
      progress: task.progress ?? null,
      status,
    });
    if (status === "failed") {
      patch({
        lastError: `Tripo reported ${task.status}. Another generation requires explicit approval.`,
        leaseUntil: 0,
      });
      return true;
    }
    if (status === "downloading") {
      if (!task.modelUrl)
        throw new Error("Provider succeeded, but no model_url was returned.");
      const bytes = await download(task.modelUrl);
      const metadata = await validateModel(bytes);
      const finalAsset = await saveAsset(j.projectId, "model", bytes, {
        ...metadata,
        providerTask: j.providerId,
        model: j.model,
        source: env.mock ? "mock" : "tripo",
      });
      patch({ finalAsset, status: "ready", lastError: null, leaseUntil: 0 });
      db.update(projects)
        .set({ modelAsset: finalAsset, approved: 0, updatedAt: Date.now() })
        .where(
          and(
            eq(projects.id, j.projectId),
            eq(projects.revision, j.inputRevision),
          ),
        )
        .run();
      return true;
    }
    patch({ nextPoll: Date.now() + env.poll, leaseUntil: 0 });
  } catch (e) {
    const attempts = j.attempts + 1,
      assetFailure = j.providerStatus === "success";
    repo.patch(j, {
      attempts,
      status: assetFailure
        ? "asset_retry"
        : j.providerId
          ? "polling"
          : "uploading",
      lastError: assetFailure
        ? "Tripo finished. Local download or model validation needs attention; no new generation will be created. " +
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
