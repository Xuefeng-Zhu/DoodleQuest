import { spawn } from "node:child_process";
import "../src/server/env";
const children = [
  spawn("npm", ["run", "dev:web"], { stdio: "inherit", env: process.env }),
  spawn("npm", ["run", "worker"], { stdio: "inherit", env: process.env }),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill("SIGTERM"));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((c) => c.on("exit", stop));
