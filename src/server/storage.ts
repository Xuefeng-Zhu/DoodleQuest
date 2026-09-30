import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { validateBytes } from "gltf-validator";
import { env } from "./env";
import { db } from "./db";
import { assets } from "./schema";
import { HttpError } from "./security";
export interface AssetStorage {
  put(data: Buffer, extension: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export class LocalStorage implements AssetStorage {
  private filename(key: string) {
    if (!/^[a-f0-9-]+\.(png|glb)$/.test(key))
      throw new Error("Invalid asset key");
    return path.join(env.data, "assets", key);
  }
  async put(data: Buffer, extension: string) {
    const key = `${randomUUID()}.${extension}`;
    await mkdir(path.join(env.data, "assets"), { recursive: true });
    await writeFile(this.filename(key), data, { flag: "wx", mode: 0o600 });
    return key;
  }
  read(key: string) {
    return readFile(this.filename(key));
  }
  async remove(key: string) {
    await unlink(this.filename(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export const storage = new LocalStorage();
export async function saveAsset(
  projectId: string,
  kind: string,
  data: Buffer,
  metadata: object = {},
) {
  const id = randomUUID(),
    filename = await storage.put(data, kind === "model" ? "glb" : "png");
  try {
    db.insert(assets)
      .values({
        id,
        projectId,
        kind,
        filename,
        bytes: data.length,
        metadata: JSON.stringify(metadata),
        createdAt: Date.now(),
      })
      .run();
  } catch (e) {
    await storage.remove(filename);
    throw e;
  }
  return id;
}
export async function normalizeImage(data: Buffer, rotation = 0, crop = false) {
  if (data.length > 10 * 1024 * 1024)
    throw new HttpError(413, "Choose a JPEG or PNG smaller than 10 MB.");
  try {
    const s = sharp(data, { limitInputPixels: 24_000_000, failOn: "warning" });
    const m = await s.metadata();
    if (
      !["jpeg", "png"].includes(m.format || "") ||
      (m.pages || 1) > 1 ||
      !m.width ||
      !m.height ||
      m.width < 64 ||
      m.height < 64 ||
      m.width > 8000 ||
      m.height > 8000
    )
      throw new Error();
    let result = s.autoOrient().rotate(rotation);
    if (crop) result = result.resize(1024, 1024, { fit: "cover" });
    else
      result = result.resize({
        width: 1536,
        height: 1536,
        fit: "inside",
        withoutEnlargement: true,
      });
    return await result.flatten({ background: "#fffdf4" }).png().toBuffer();
  } catch {
    throw new HttpError(
      400,
      "That image could not be read. Use a still JPEG or PNG, 64–8000 pixels per side (at most 24 megapixels).",
    );
  }
}
export async function validateModel(data: Buffer) {
  if (data.length > 25 * 1024 * 1024)
    throw new Error("Model exceeds the 25 MB mobile budget.");
  if (
    data.length < 20 ||
    data.toString("ascii", 0, 4) !== "glTF" ||
    data.readUInt32LE(4) !== 2 ||
    data.readUInt32LE(8) !== data.length
  )
    throw new Error("Expected a complete GLB 2.0 model.");
  const len = data.readUInt32LE(12);
  const doc = JSON.parse(data.toString("utf8", 20, 20 + len));
  const decodedBytes = (doc.buffers || []).reduce(
    (sum: number, b: { byteLength: number }) => sum + b.byteLength,
    0,
  );
  const primitives = (doc.meshes || []).reduce(
    (sum: number, m: { primitives: unknown[] }) =>
      sum + (m.primitives?.length || 0),
    0,
  );
  if (decodedBytes > 64 * 1024 * 1024 || primitives > 64)
    throw new Error(
      "Model exceeds the 64 MB decoded-buffer or 64 draw-primitive budget.",
    );
  for (const v of doc.bufferViews || []) {
    const compression = v.extensions?.EXT_meshopt_compression;
    if (
      compression &&
      compression.count * compression.byteStride > 64 * 1024 * 1024
    )
      throw new Error("Compressed geometry exceeds the decoded-buffer budget.");
  }
  if (
    (doc.nodes?.length || 0) > 512 ||
    (doc.materials?.length || 0) > 64 ||
    (doc.textures?.length || 0) > 16 ||
    (doc.meshes?.length || 0) > 128
  )
    throw new Error(
      "Model exceeds the node/material/texture complexity budget.",
    );
  if (
    (doc.buffers || []).some((b: { uri?: string }) => b.uri) ||
    (doc.images || []).some((b: { uri?: string }) => b.uri)
  )
    throw new Error("External model resources are not allowed.");
  const extensions: string[] = doc.extensionsRequired || [];
  if (
    extensions.some(
      (e) =>
        ![
          "EXT_meshopt_compression",
          "KHR_texture_transform",
          "KHR_materials_unlit",
        ].includes(e),
    )
  )
    throw new Error(
      "This model uses an unsupported required extension. No automatic regeneration was started.",
    );
  const report = await validateBytes(new Uint8Array(data), { maxIssues: 20 });
  if (report.issues.numErrors)
    throw new Error("The generated GLB did not pass structural validation.");
  let triangles = 0;
  for (const m of doc.meshes || [])
    for (const p of m.primitives || []) {
      if ((p.mode ?? 4) !== 4)
        throw new Error("Only triangle meshes are supported.");
      triangles +=
        (doc.accessors[p.indices ?? p.attributes.POSITION]?.count || 0) / 3;
    }
  if (triangles > 100000)
    throw new Error("Model exceeds the 100,000-triangle safety budget.");
  let texturePixels = 0;
  for (const img of doc.images || []) {
    const v = doc.bufferViews?.[img.bufferView];
    if (v) {
      const binStart = 20 + len + 8;
      const raw = data.subarray(
        binStart + (v.byteOffset || 0),
        binStart + (v.byteOffset || 0) + v.byteLength,
      );
      const meta = await sharp(raw, {
        limitInputPixels: 16_777_216,
      }).metadata();
      if ((meta.width || 0) > 4096 || (meta.height || 0) > 4096)
        throw new Error("Texture exceeds the 4096-pixel budget.");
      texturePixels += (meta.width || 0) * (meta.height || 0);
      if (texturePixels > 16_777_216)
        throw new Error("Combined textures exceed the 16-megapixel budget.");
    }
  }
  return { bytes: data.length, triangles, extensions, validated: true };
}
export async function downloadModel(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !env.hosts.includes(u.hostname)
  )
    throw new Error(
      "Provider output host is not approved. Ask the host to review TRIPO_ASSET_HOSTS; do not regenerate.",
    );
  const addresses = await lookup(u.hostname, { all: true });
  if (
    addresses.some(({ address }) =>
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::|fc|fd|fe80)/i.test(
        address,
      ),
    )
  )
    throw new Error("Private output address denied.");
  const res = await fetch(u, {
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Model download failed (${res.status}).`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No model body.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > 25 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Model exceeds 25 MB.");
    }
    chunks.push(r.value);
  }
  return Buffer.concat(chunks);
}
export function asset(id: string) {
  const a = db.select().from(assets).where(eq(assets.id, id)).get();
  if (!a) throw new HttpError(404, "Asset unavailable.");
  return a;
}
