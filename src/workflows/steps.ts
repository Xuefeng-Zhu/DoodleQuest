export async function advanceJob(kind: "generation" | "motion", jobId: string) {
  "use step";
  const { ready, db } = await import("../server/db");
  const { jobs, motionJobs } = await import("../server/schema");
  const { activeStatuses } = await import("../server/repository");
  const { env } = await import("../server/env");
  const { eq } = await import("drizzle-orm");
  await ready();
  // Hosted example mode must never contact the provider.
  if (!env.key && !env.mock) return { done: true, waitMs: 0 };
  const { LiveTripo } = await import("../server/tripo");
  const { MockTripo, mockDownload } = await import("../server/mock");
  const provider = env.mock ? new MockTripo() : new LiveTripo();
  const download = env.mock ? mockDownload : undefined;
  if (kind === "generation") {
    const { processOne } = await import("../server/worker");
    await processOne(provider, undefined, download, jobId);
  } else {
    const { processMotionOne } = await import("../server/motion-worker");
    await processMotionOne(provider, undefined, download, jobId);
  }
  const table = kind === "generation" ? jobs : motionJobs;
  const [job] = await db
    .select()
    .from(table)
    .where(eq(table.id, jobId))
    .limit(1);
  if (!job || !activeStatuses.includes(job.status))
    return { done: true, waitMs: 0 };
  return {
    done: false,
    waitMs: Math.max(
      env.poll,
      job.nextPoll - Date.now(),
      job.leaseUntil - Date.now(),
      500,
    ),
  };
}
