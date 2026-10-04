import { env } from "./env";
import { processOne } from "./worker";
import { processMotionOne } from "./motion-worker";
import { LiveTripo } from "./tripo";
import { MockTripo, mockDownload } from "./mock";
import { flushDeletedFiles } from "./cleanup";
import { workerReadiness } from "./health";
let running = true;
const runtimeId = process.env.DQ_RUNTIME_ID || "standalone";
const readiness = workerReadiness(env.data, runtimeId);
const stop = () => {
  running = false;
  clearInterval(heartbeat);
  try {
    readiness.failed();
  } catch {
    process.exitCode = 1;
  }
};
readiness.pulse();
const heartbeat = setInterval(() => {
  try {
    readiness.pulse();
  } catch {
    console.error("Worker readiness could not be saved; stopping worker.");
    process.exitCode = 1;
    stop();
  }
}, 5000);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(
  `DoodleQuest worker: ${env.mock ? "TEST MOCK" : env.key ? "Tripo live" : "example only (no key)"}`,
);
while (running) {
  try {
    await flushDeletedFiles();
    if (!running) break;
    if (env.key || env.mock) {
      await processOne(
        env.mock ? new MockTripo() : new LiveTripo(),
        undefined,
        env.mock ? mockDownload : undefined,
      );
      if (!running) break;
      await processMotionOne(
        env.mock ? new MockTripo() : new LiveTripo(),
        undefined,
        env.mock ? mockDownload : undefined,
      );
    }
    if (running) readiness.succeeded();
  } catch {
    try {
      readiness.failed();
    } catch {}
    console.error("Worker iteration interrupted; durable jobs retained.");
  }
  if (running) await new Promise((r) => setTimeout(r, env.mock ? 300 : 1000));
}
stop();
