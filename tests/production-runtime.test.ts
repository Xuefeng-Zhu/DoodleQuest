import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { appOrigin, productionOrigin } from "../src/server/origin";
import {
  prepareProductionEnvironment,
  superviseProduction,
} from "../src/server/production-runtime";

const directories: string[] = [];
function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "dq-production-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("deployment origin", () => {
  it("uses the Render hostname while preserving an explicit custom origin", () => {
    expect(
      appOrigin({ RENDER_EXTERNAL_HOSTNAME: "doodlequest.onrender.com" }),
    ).toBe("https://doodlequest.onrender.com");
    expect(
      appOrigin({
        APP_ORIGIN: "https://gift.example.com/",
        RENDER_EXTERNAL_HOSTNAME: "doodlequest.onrender.com",
      }),
    ).toBe("https://gift.example.com");
  });

  it("allows a build without deployment configuration but refuses to launch that way", () => {
    expect(appOrigin({})).toBe("http://localhost:3000");
    expect(() => productionOrigin({})).toThrow("Set APP_ORIGIN");
    expect(() =>
      productionOrigin({ APP_ORIGIN: "http://gift.example.com" }),
    ).toThrow("HTTPS");
  });

  it("rejects credentials, paths and malformed platform hostname values", () => {
    for (const APP_ORIGIN of [
      "https://user:password@gift.example.com",
      "https://gift.example.com/path",
      "https://gift.example.com/?token=private",
    ])
      expect(() => appOrigin({ APP_ORIGIN })).toThrow();
    expect(() =>
      appOrigin({ RENDER_EXTERNAL_HOSTNAME: "gift.example.com/path" }),
    ).toThrow();
  });
});

describe("persistent storage startup", () => {
  it("probes both writable directories, preserves existing data and gives each boot a new identity", () => {
    const directory = temporaryDirectory();
    writeFileSync(path.join(directory, "existing.sqlite"), "preserve");
    const environment = {
      APP_ORIGIN: "https://gift.example.com",
      DATA_DIR: directory,
    };
    const first = prepareProductionEnvironment(environment);
    const second = prepareProductionEnvironment(environment);
    expect(first.DQ_RUNTIME_ID).not.toBe(second.DQ_RUNTIME_ID);
    expect(first.DQ_STORAGE_VERIFIED).toBe("1");
    expect(readFileSync(path.join(directory, "existing.sqlite"), "utf8")).toBe(
      "preserve",
    );
    expect(readdirSync(directory).sort()).toEqual([
      "assets",
      "existing.sqlite",
    ]);
    expect(readdirSync(path.join(directory, "assets"))).toEqual([]);
  });

  it("fails startup when the asset directory is unusable or storage is relative", () => {
    const directory = temporaryDirectory();
    writeFileSync(path.join(directory, "assets"), "not a directory");
    expect(() =>
      prepareProductionEnvironment({
        APP_ORIGIN: "https://gift.example.com",
        DATA_DIR: directory,
      }),
    ).toThrow();
    expect(() =>
      prepareProductionEnvironment({
        APP_ORIGIN: "https://gift.example.com",
        DATA_DIR: "data",
      }),
    ).toThrow("absolute path");
    expect(readdirSync(directory)).toEqual(["assets"]);
  });
});

function child() {
  const process = new EventEmitter() as ChildProcess;
  process.kill = vi.fn(() => true);
  return process;
}
const commands = [
  { name: "web", args: ["web"] },
  { name: "worker", args: ["worker"] },
];

describe("production process supervision", () => {
  it.each([0, 143])(
    "stops the sibling and fails on unexpected exit code %i",
    async (code) => {
      const web = child();
      const worker = child();
      const signals = new EventEmitter();
      const result = superviseProduction(commands, {
        environment: { NODE_ENV: "test" },
        signals,
        log: vi.fn(),
        spawnChild: vi
          .fn()
          .mockReturnValueOnce(web)
          .mockReturnValueOnce(worker),
      });
      web.emit("exit", code, null);
      expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
      worker.emit("exit", 0, null);
      expect(await result).toBe(1);
      expect(signals.listenerCount("SIGTERM")).toBe(0);
      expect(signals.listenerCount("SIGINT")).toBe(0);
    },
  );

  it("cleans up a running sibling when spawning another process fails", async () => {
    const web = child();
    const worker = child();
    const result = superviseProduction(commands, {
      environment: { NODE_ENV: "test" },
      signals: new EventEmitter(),
      log: vi.fn(),
      spawnChild: vi.fn().mockReturnValueOnce(web).mockReturnValueOnce(worker),
    });
    worker.emit("error", new Error("spawn failed"));
    expect(web.kill).toHaveBeenCalledWith("SIGTERM");
    web.emit("exit", 0, null);
    expect(await result).toBe(1);
  });

  it.each([0, 130, 143])(
    "waits for both children and accepts graceful shutdown code %i",
    async (code) => {
      const web = child();
      const worker = child();
      const signals = new EventEmitter();
      const finished = vi.fn();
      const result = superviseProduction(commands, {
        environment: { NODE_ENV: "test" },
        signals,
        log: vi.fn(),
        spawnChild: vi
          .fn()
          .mockReturnValueOnce(web)
          .mockReturnValueOnce(worker),
      }).then((code) => {
        finished(code);
        return code;
      });
      signals.emit("SIGTERM");
      expect(web.kill).toHaveBeenCalledWith("SIGTERM");
      expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
      web.emit("exit", code, null);
      await Promise.resolve();
      expect(finished).not.toHaveBeenCalled();
      worker.emit("exit", 0, null);
      expect(await result).toBe(0);
    },
  );

  it("forces a stuck child to stop after the bounded drain period", async () => {
    vi.useFakeTimers();
    const web = child();
    const signals = new EventEmitter();
    const result = superviseProduction(commands.slice(0, 1), {
      environment: { NODE_ENV: "test" },
      signals,
      shutdownMs: 100,
      log: vi.fn(),
      spawnChild: () => web,
    });
    signals.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(100);
    expect(web.kill).toHaveBeenLastCalledWith("SIGKILL");
    web.emit("exit", null, "SIGKILL");
    expect(await result).toBe(1);
  });
});
