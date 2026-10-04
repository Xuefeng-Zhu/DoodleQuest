import { createHook, sleep } from "workflow";
import { advanceJob } from "./steps";

// Inputs and outputs contain identifiers and scheduling metadata only. Provider
// credentials and image/model bytes stay inside the Node.js step.
export async function processJob(kind: "generation" | "motion", jobId: string) {
  "use workflow";
  using owner = createHook({ token: `doodlequest:${kind}:${jobId}` });
  const conflict = await owner.getConflict();
  if (conflict) return { status: "duplicate", runId: conflict.runId };

  // Bound the work per run, including a provider that never reaches a terminal
  // state. Reopening the creator can resume the SAME durable provider task.
  for (let attempt = 0; attempt < 720; attempt++) {
    const state = await advanceJob(kind, jobId);
    if (state.done) return { status: "finished" };
    await sleep(state.waitMs);
  }
  return { status: "paused" };
}
