// Deterministic test geometry; not a generated Tripo character.
import { OctahedronGeometry } from "three";
import { writeFile, mkdir } from "node:fs/promises";
const geo = new OctahedronGeometry(1);
const positions = Buffer.from(geo.attributes.position.array.buffer);
const normals = Buffer.from(geo.attributes.normal.array.buffer);
const bin = Buffer.concat([positions, normals]);
const doc = {
  asset: { version: "2.0", generator: "DoodleQuest automated TEST fixture" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [
    { primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] },
  ],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.3, 0.65, 0.5, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    },
  ],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: positions.length,
      byteLength: normals.length,
      target: 34962,
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: geo.attributes.position.count,
      type: "VEC3",
      min: [-1, -1, -1],
      max: [1, 1, 1],
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: geo.attributes.normal.count,
      type: "VEC3",
    },
  ],
};
let json = Buffer.from(JSON.stringify(doc));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + bin.length, 8);
header.writeUInt32LE(json.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bin.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
await mkdir("tests/fixtures", { recursive: true });
await writeFile(
  "tests/fixtures/mock.glb",
  Buffer.concat([header, json, bh, bin]),
);
geo.dispose();
