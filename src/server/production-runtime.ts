import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { productionOrigin } from "./origin";

export function prepareProductionEnvironment(
  variables: Partial<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const origin = productionOrigin(variables);
  const dataDirectory = variables.DATA_DIR;
  if (!dataDirectory || !path.isAbsolute(dataDirectory))
    throw new Error("DATA_DIR must be an absolute path to persistent storage.");
  for (const directory of [dataDirectory, path.join(dataDirectory, "assets")]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const probe = path.join(directory, `.startup-${randomUUID()}`);
    let file: number | undefined;
    try {
      file = openSync(probe, "wx", 0o600);
      writeSync(file, "DoodleQuest storage check");
      fsyncSync(file);
    } finally {
      if (file !== undefined) closeSync(file);
      try {
        unlinkSync(probe);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  return {
    ...variables,
    NODE_ENV: "production",
    APP_ORIGIN: origin,
    DATA_DIR: dataDirectory,
    DQ_RUNTIME_ID: randomUUID(),
    DQ_STORAGE_VERIFIED: "1",
  };
}

type ChildCommand = { name: string; args: string[] };

export function superviseProduction(
  commands: ChildCommand[],
  options: {
    environment: NodeJS.ProcessEnv;
    signals?: EventEmitter;
    shutdownMs?: number;
    spawnChild?: (command: ChildCommand) => ChildProcess;
    log?: (message: string) => void;
  },
): Promise<number> {
  const signals = options.signals ?? process;
  const log = options.log ?? console.error;
  const launch =
    options.spawnChild ??
    ((command: ChildCommand) =>
      spawn(process.execPath, command.args, {
        env: options.environment,
        stdio: "inherit",
      }));

  return new Promise((resolve) => {
    const children = new Set<ChildProcess>();
    let stopping = false;
    let starting = true;
    let exitCode = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const complete = () => {
      if (starting || children.size) return;
      if (deadline) clearTimeout(deadline);
      signals.off("SIGTERM", terminate);
      signals.off("SIGINT", terminate);
      resolve(exitCode);
    };
    const stop = (code: number) => {
      exitCode = Math.max(exitCode, code);
      if (!stopping) {
        stopping = true;
        for (const child of children) child.kill("SIGTERM");
        deadline = setTimeout(() => {
          exitCode = 1;
          log(
            "Production shutdown deadline reached; stopping remaining processes.",
          );
          for (const child of children) child.kill("SIGKILL");
        }, options.shutdownMs ?? 45_000);
      }
      complete();
    };
    const terminate = () => stop(0);
    signals.on("SIGTERM", terminate);
    signals.on("SIGINT", terminate);

    for (const command of commands) {
      if (stopping) break;
      try {
        const child = launch(command);
        children.add(child);
        child.once("error", () => {
          if (child.pid === undefined) children.delete(child);
          log(`${command.name} could not start.`);
          stop(1);
        });
        child.once("exit", (code, signal) => {
          children.delete(child);
          if (!stopping) {
            log(
              `${command.name} exited unexpectedly (${signal || code || 0}).`,
            );
            stop(1);
          } else if (code !== null && ![0, 130, 143].includes(code)) {
            // Next.js completes graceful signal cleanup with 128 + the
            // signal number. Accept those codes only after shutdown began.
            exitCode = 1;
          }
          complete();
        });
      } catch {
        log(`${command.name} could not start.`);
        stop(1);
      }
    }
    starting = false;
    complete();
  });
}
