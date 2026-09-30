import { env } from "./env";
import { processOne } from "./worker";
import { LiveTripo } from "./tripo";
import { MockTripo, mockDownload } from "./mock";
import { flushDeletedFiles } from "./cleanup";
let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
console.log(
  `DoodleQuest worker: ${env.mock ? "TEST MOCK" : env.key ? "Tripo live" : "example only (no key)"}`,
);
while (running) {
  try {
    await flushDeletedFiles();
    if (env.key || env.mock)
      await processOne(
        env.mock ? new MockTripo() : new LiveTripo(),
        undefined,
        env.mock ? mockDownload : undefined,
      );
  } catch {
    console.error("Worker iteration interrupted; durable jobs retained.");
  }
  await new Promise((r) => setTimeout(r, env.mock ? 300 : 1000));
}
