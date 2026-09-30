import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { migrate } from "../src/server/db";
await mkdir("public", { recursive: true });
await sharp("public/sample-drawing.svg")
  .png()
  .toFile("public/sample-drawing.png");
migrate();
console.log(
  "Seed ready: original Pip drawing + procedural example. No provider call.",
);
