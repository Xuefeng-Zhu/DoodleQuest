import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  removeWorkerHeartbeat,
  runtimeHealth,
  workerReadiness,
  writeWorkerHeartbeat,
} from "../src/server/health";

const directories: string[] = [];
function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "dq-health-"));
  directories.push(directory);
  mkdirSync(path.join(directory, "assets"));
  return {
    dataDirectory: directory,
    runtimeId: "current-boot",
    storageVerified: true,
    databaseCheck: () => 1,
    now: 100_000,
  };
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("read-only runtime health", () => {
  it("starts readiness with a fresh nested data directory and no local database", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "dq-health-fresh-"));
    directories.push(root);
    const dataDirectory = path.join(root, "fresh", "worker");
    const readiness = workerReadiness(dataDirectory, "external-postgres-boot");

    readiness.pulse();

    const record = JSON.parse(
      readFileSync(path.join(dataDirectory, "worker-heartbeat.json"), "utf8"),
    );
    expect(record.runtimeId).toBe("external-postgres-boot");
    expect(record.updatedAt).toBeGreaterThan(0);
    expect(readdirSync(dataDirectory)).toEqual(["worker-heartbeat.json"]);
    readiness.failed();
    expect(readdirSync(dataDirectory)).toEqual([]);
    readiness.succeeded();
    expect(readdirSync(dataDirectory)).toEqual(["worker-heartbeat.json"]);
  });

  it("withholds timer heartbeats after work fails until a complete iteration recovers", () => {
    const options = setup();
    const readiness = workerReadiness(options.dataDirectory, options.runtimeId);
    const check = () => runtimeHealth({ ...options, now: Date.now() });
    readiness.pulse();
    expect(check().ready).toBe(true);
    readiness.failed();
    readiness.pulse();
    readiness.pulse();
    expect(check().ready).toBe(false);
    readiness.succeeded();
    expect(check().ready).toBe(true);
  });

  it("requires the worker from this boot and leaves heartbeat contents unchanged", () => {
    const options = setup();
    writeWorkerHeartbeat(options.dataDirectory, "previous-boot", options.now);
    expect(runtimeHealth(options).ready).toBe(false);
    writeWorkerHeartbeat(options.dataDirectory, options.runtimeId, options.now);
    const file = path.join(options.dataDirectory, "worker-heartbeat.json");
    const before = readFileSync(file);
    expect(runtimeHealth(options)).toEqual({
      ready: true,
      database: true,
      storage: true,
      worker: true,
    });
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(options.dataDirectory).sort()).toEqual([
      "assets",
      "worker-heartbeat.json",
    ]);
  });

  it("fails readiness for missing, stale, future-dated and malformed heartbeat records", () => {
    const options = setup();
    expect(runtimeHealth(options).worker).toBe(false);
    for (const timestamp of [options.now - 30_001, options.now + 1]) {
      writeWorkerHeartbeat(options.dataDirectory, options.runtimeId, timestamp);
      expect(runtimeHealth(options).ready).toBe(false);
    }
    writeFileSync(
      path.join(options.dataDirectory, "worker-heartbeat.json"),
      "unfinished JSON",
    );
    expect(runtimeHealth(options).ready).toBe(false);
  });

  it("does not report readiness without the startup write check or a working database", () => {
    const options = setup();
    writeWorkerHeartbeat(options.dataDirectory, options.runtimeId, options.now);
    expect(runtimeHealth({ ...options, storageVerified: false }).ready).toBe(
      false,
    );
    const failed = runtimeHealth({
      ...options,
      databaseCheck: () => {
        throw new Error("private database failure");
      },
    });
    expect(failed.database).toBe(false);
    expect(failed.ready).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("private database failure");
  });

  it("removes its own heartbeat during shutdown without deleting a newer boot's record", () => {
    const options = setup();
    writeWorkerHeartbeat(options.dataDirectory, "newer-boot", options.now);
    removeWorkerHeartbeat(options.dataDirectory, options.runtimeId);
    expect(readdirSync(options.dataDirectory)).toContain(
      "worker-heartbeat.json",
    );
    removeWorkerHeartbeat(options.dataDirectory, "newer-boot");
    expect(readdirSync(options.dataDirectory)).toEqual(["assets"]);
  });
});
