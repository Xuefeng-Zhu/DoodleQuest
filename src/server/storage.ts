import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { validateBytes } from "gltf-validator";
import { env } from "./env";
import { db, ready, transaction } from "./db";
import { assets, assetBlobs } from "./schema";
import { HttpError } from "./security";
export interface AssetStorage {
  put(data: Buffer, extension: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export class DatabaseStorage implements AssetStorage {
  private validateKey(key: string) {
    if (!/^[a-f0-9-]+\.(png|glb)$/.test(key))
      throw new Error("Invalid asset key");
    return key;
  }
  async put(data: Buffer, extension: string) {
    if (!["png", "glb"].includes(extension))
      throw new Error("Invalid asset extension");
    const key = `${randomUUID()}.${extension}`;
    await transaction(async () => {
      const [usage] = await db
        .select({ bytes: sql<string>`COALESCE(SUM(${assetBlobs.bytes}), 0)` })
        .from(assetBlobs);
      if (Number(usage.bytes) + data.length > env.assetBudget)
        throw new HttpError(
          507,
          "The host's drawing and model storage is full. Delete an unused project before trying again.",
        );
      await db
        .insert(assetBlobs)
        .values({
          filename: key,
          data,
          bytes: data.length,
          createdAt: Date.now(),
        });
    });
    return key;
  }
  read(key: string): Promise<Buffer> {
    this.validateKey(key);
    return this.readBytes(key);
  }
  private async readBytes(key: string) {
    await ready();
    const [record] = await db
      .select({ data: assetBlobs.data })
      .from(assetBlobs)
      .where(eq(assetBlobs.filename, key));
    if (!record) throw new HttpError(404, "Asset unavailable.");
    return Buffer.from(record.data);
  }
  async remove(key: string) {
    this.validateKey(key);
    await transaction(async () => {
      await db.delete(assetBlobs).where(eq(assetBlobs.filename, key));
    });
  }
}
export const storage = new DatabaseStorage();
/** A completed provider artifact violates a fixed local safety budget. */
export class InvalidModelError extends Error {}
export async function saveAsset(
  projectId: string,
  kind: string,
  data: Buffer,
  metadata: object = {},
) {
  return transaction(async () => {
    const id = randomUUID();
    const filename = await storage.put(data, kind === "model" ? "glb" : "png");
    await db
      .insert(assets)
      .values({
        id,
        projectId,
        kind,
        filename,
        bytes: data.length,
        metadata: JSON.stringify(metadata),
        createdAt: Date.now(),
      });
    return id;
  });
}
export async function normalizeImage(data: Buffer, rotation = 0, crop = false) {
  if (data.length > env.uploadMaxBytes)
    throw new HttpError(
      413,
      `Choose a JPEG or PNG smaller than ${Math.floor((env.uploadMaxBytes / (1024 * 1024)) * 100) / 100} MB.`,
    );
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
export async function validateModel(
  data: Buffer,
  requireSkeletalAnimation = false,
) {
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
  const skins = doc.skins || [];
  const animations = doc.animations || [];
  let channels = 0,
    keyframes = 0;
  if (
    skins.length > 8 ||
    skins.some((skin: { joints: number[] }) => skin.joints.length > 256) ||
    animations.length > 16
  )
    throw new Error("Model exceeds the skeleton or animation clip budget.");
  for (const animation of animations) {
    channels += animation.channels?.length || 0;
    for (const sampler of animation.samplers || []) {
      const input = doc.accessors?.[sampler.input];
      keyframes += input?.count || 0;
      if (input?.max?.[0] > 600)
        throw new Error("Animation exceeds the ten-minute clip budget.");
    }
  }
  if (channels > 4096 || keyframes > 500_000)
    throw new Error("Model exceeds the animation channel or keyframe budget.");
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
          "KHR_mesh_quantization",
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
  if (requireSkeletalAnimation) {
    const usedSkins = new Set<number>(
      (doc.nodes || [])
        .filter(
          (node: { skin?: number; mesh?: number }) =>
            node.skin !== undefined && node.mesh !== undefined,
        )
        .map((node: { skin: number }) => node.skin),
    );
    const joints = new Set<number>(
      skins.flatMap((skin: { joints: number[] }, index: number) =>
        usedSkins.has(index) ? skin.joints : [],
      ),
    );
    if (
      !animations.length ||
      animations.some(
        (animation: {
          channels: { target: { node: number; path: string } }[];
        }) =>
          !animation.channels.some(
            ({ target }) =>
              joints.has(target.node) &&
              ["rotation", "translation", "scale"].includes(target.path),
          ),
      )
    )
      throw new Error(
        "The returned model has no playable skeletal animation for one or more clips.",
      );
  }
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
  return {
    bytes: data.length,
    triangles,
    extensions,
    validated: true,
    rigged: skins.length > 0,
    animationClips: animations.map(
      (clip: { name?: string }, index: number): string =>
        (clip.name || `Animation ${index + 1}`).slice(0, 160),
    ) as string[],
  };
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
      throw new InvalidModelError("Model exceeds 25 MB.");
    }
    chunks.push(r.value);
  }
  return Buffer.concat(chunks);
}
export async function asset(id: string) {
  await ready();
  const [a] = await db.select().from(assets).where(eq(assets.id, id));
  if (!a) throw new HttpError(404, "Asset unavailable.");
  return a;
}
