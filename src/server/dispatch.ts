import { and, eq } from "drizzle-orm";
import { getRun, start } from "workflow/api";
import { processJob } from "../workflows/process-job";
import { db, transaction } from "./db";
import { workflowDispatch } from "./schema";

// A short durable claim prevents creator polling from enqueuing duplicate runs.
// If a response is lost after enqueueing, the workflow's deterministic hook and
// the worker's fenced database leases protect the existing provider task.
export async function dispatchJob(
  kind: "generation" | "motion",
  jobId: string,
) {
  const identity = and(
    eq(workflowDispatch.kind, kind),
    eq(workflowDispatch.jobId, jobId),
  );
  const claim = await transaction(async () => {
    const [previous] = await db
      .select()
      .from(workflowDispatch)
      .where(identity)
      .limit(1);
    const now = Date.now();
    if (previous && previous.dispatchUntil > now) return null;
    await db
      .insert(workflowDispatch)
      .values({
        kind,
        jobId,
        runId: previous?.runId ?? null,
        dispatchUntil: now + 60_000,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [workflowDispatch.kind, workflowDispatch.jobId],
        set: { dispatchUntil: now + 60_000 },
      });
    return { previousRun: previous?.runId, claimedUntil: now + 60_000 };
  });
  if (!claim) return;
  // Keep uncertain starts claimed until lease expiry. Do not turn a temporary
  // queue failure into a lost paid job; owner polling safely repairs dispatch.
  try {
    let runId: string | null | undefined = claim.previousRun;
    if (runId) {
      const run = getRun(runId);
      if (
        !(await run.exists) ||
        !["pending", "running"].includes(await run.status)
      )
        runId = undefined;
    }
    if (!runId) runId = (await start(processJob, [kind, jobId])).runId;
    await transaction(async () => {
      await db
        .update(workflowDispatch)
        .set({ runId, dispatchUntil: Date.now() + 300_000 })
        .where(
          and(identity, eq(workflowDispatch.dispatchUntil, claim.claimedUntil)),
        );
    });
  } catch {
    console.error(
      "Job dispatch deferred; the durable job is retained for recovery.",
    );
  }
}
