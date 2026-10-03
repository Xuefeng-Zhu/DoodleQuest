import { describe, expect, it } from "vitest";
import { validateBytes } from "gltf-validator";
import { validateModel } from "../src/server/storage";

function quantizedTriangle(extraRequired: string[] = []) {
  // Original synthetic geometry: three normalized signed-short positions,
  // padded to a four-byte vertex alignment. No provider output is included.
  const binary = Buffer.alloc(24);
  const positions = [
    [-32767, 0, 0],
    [32767, 0, 0],
    [0, 32767, 0],
  ];
  positions.forEach((position, vertex) =>
    position.forEach((value, component) =>
      binary.writeInt16LE(value, vertex * 8 + component * 2),
    ),
  );
  const extensions = ["KHR_mesh_quantization", ...extraRequired];
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: extensions,
    extensionsRequired: extensions,
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteLength: binary.length, byteStride: 8, target: 34962 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5122,
        normalized: true,
        count: 3,
        type: "VEC3",
        min: [-32767, 0, 0],
        max: [32767, 32767, 0],
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const rawJson = Buffer.from(JSON.stringify(document));
  const json = Buffer.concat([
    rawJson,
    Buffer.alloc((4 - (rawJson.length % 4)) % 4, 0x20),
  ]);
  const glb = Buffer.alloc(28 + json.length + binary.length);
  glb.write("glTF", 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  glb.writeUInt32LE(binary.length, 20 + json.length);
  glb.writeUInt32LE(0x004e4942, 24 + json.length);
  binary.copy(glb, 28 + json.length);
  return glb;
}

describe("quantized model validation", () => {
  it("accepts structurally valid quantized positions supported by the viewer", async () => {
    const bytes = quantizedTriangle();
    const report = await validateBytes(new Uint8Array(bytes));
    expect(report.issues.numErrors).toBe(0);
    await expect(validateModel(bytes)).resolves.toEqual({
      bytes: bytes.length,
      triangles: 1,
      extensions: ["KHR_mesh_quantization"],
      validated: true,
      rigged: false,
      animationClips: [],
    });
  });

  it("still rejects an unknown required extension on a quantized model", async () => {
    await expect(
      validateModel(quantizedTriangle(["VENDOR_unsupported_extension"])),
    ).rejects.toThrow("unsupported required extension");
  });
});
