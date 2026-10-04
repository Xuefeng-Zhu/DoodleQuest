import {
  accessSync,
  constants,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const heartbeatName = "worker-heartbeat.json";
const heartbeatMaxAge = 30_000;

export function writeWorkerHeartbeat(
  dataDirectory: string,
  runtimeId: string,
  now = Date.now(),
) {
  const target = path.join(dataDirectory, heartbeatName);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ runtimeId, updatedAt: now }), {
      mode: 0o600,
    });
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function removeWorkerHeartbeat(
  dataDirectory: string,
  runtimeId: string,
) {
  const target = path.join(dataDirectory, heartbeatName);
  try {
    const record = JSON.parse(readFileSync(target, "utf8"));
    if (record.runtimeId === runtimeId) unlinkSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function workerReadiness(dataDirectory: string, runtimeId: string) {
  let healthy = true;
  return {
    pulse() {
      if (healthy) writeWorkerHeartbeat(dataDirectory, runtimeId);
    },
    succeeded() {
      if (!healthy) writeWorkerHeartbeat(dataDirectory, runtimeId);
      healthy = true;
    },
    failed() {
      // A live event loop is not enough when every work iteration fails.
      // Stay unavailable until an entire later iteration succeeds.
      healthy = false;
      removeWorkerHeartbeat(dataDirectory, runtimeId);
    },
  };
}

export function runtimeHealth(options: {
  dataDirectory: string;
  runtimeId?: string;
  storageVerified: boolean;
  databaseCheck: () => unknown;
  now?: number;
}) {
  let database = false;
  let storage = false;
  let worker = false;
  try {
    options.databaseCheck();
    database = true;
  } catch {}
  try {
    if (options.storageVerified && options.runtimeId) {
      accessSync(options.dataDirectory, constants.R_OK | constants.W_OK);
      accessSync(path.join(options.dataDirectory, "assets"), constants.W_OK);
      storage = true;
    }
  } catch {}
  try {
    const record = JSON.parse(
      readFileSync(path.join(options.dataDirectory, heartbeatName), "utf8"),
    );
    const age = (options.now ?? Date.now()) - record.updatedAt;
    worker =
      !!options.runtimeId &&
      record.runtimeId === options.runtimeId &&
      typeof record.updatedAt === "number" &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= heartbeatMaxAge;
  } catch {}
  return { ready: database && storage && worker, database, storage, worker };
}
