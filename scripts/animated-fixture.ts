// Original, deterministic skinned TEST character. Never presented as Tripo output.
// Run with: npx tsx scripts/animated-fixture.ts
import { mkdir, writeFile } from "node:fs/promises";
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { validateBytes } from "gltf-validator";

// GLTFExporter only needs this browser API to package binary Blobs in Node.
class BinaryFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
}
globalThis.FileReader = BinaryFileReader as unknown as typeof FileReader;

const positions: number[] = [],
  normals: number[] = [],
  colors: number[] = [],
  joints: number[] = [],
  weights: number[] = [];
function part(
  geometry: BufferGeometry,
  position: [number, number, number],
  scale: [number, number, number],
  joint: number,
  color: string,
) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  geo.scale(...scale).translate(...position);
  const p = geo.getAttribute("position"),
    n = geo.getAttribute("normal"),
    c = new Color(color);
  for (let i = 0; i < p.count; i++) {
    positions.push(p.getX(i), p.getY(i), p.getZ(i));
    normals.push(n.getX(i), n.getY(i), n.getZ(i));
    colors.push(c.r, c.g, c.b);
    joints.push(joint, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  geo.dispose();
  if (geo !== geometry) geometry.dispose();
}
const orb = () => new SphereGeometry(1, 12, 8);
part(orb(), [0, 0.88, 0], [0.4, 0.49, 0.3], 0, "#83baa0");
part(orb(), [0, 1.48, 0.025], [0.43, 0.39, 0.33], 1, "#a7d3bb");
part(orb(), [-0.24, 1.95, 0], [0.1, 0.3, 0.1], 1, "#a7d3bb");
part(orb(), [0.24, 1.9, 0], [0.1, 0.26, 0.1], 1, "#a7d3bb");
part(orb(), [-0.49, 0.83, 0], [0.12, 0.28, 0.13], 2, "#83baa0");
part(orb(), [0.49, 0.83, 0], [0.12, 0.28, 0.13], 3, "#83baa0");
part(orb(), [-0.2, 0.26, 0.07], [0.17, 0.29, 0.2], 4, "#60947d");
part(orb(), [0.2, 0.26, 0.07], [0.17, 0.29, 0.2], 5, "#60947d");
part(orb(), [-0.15, 1.5, 0.33], [0.034, 0.05, 0.025], 1, "#263f38");
part(orb(), [0.15, 1.5, 0.33], [0.034, 0.05, 0.025], 1, "#263f38");
part(orb(), [0, 1.37, 0.347], [0.06, 0.024, 0.021], 1, "#263f38");
part(
  new BoxGeometry(1, 1, 1),
  [0, 1.13, 0.23],
  [0.62, 0.11, 0.2],
  0,
  "#efb95e",
);

const bones = ["Root", "Head", "ArmL", "ArmR", "LegL", "LegR"].map((name) => {
  const bone = new Bone();
  bone.name = name;
  return bone;
});
bones[1].position.set(0, 1.2, 0);
bones[2].position.set(-0.49, 1.1, 0);
bones[3].position.set(0.49, 1.1, 0);
bones[4].position.set(-0.2, 0.5, 0);
bones[5].position.set(0.2, 0.5, 0);
bones[0].add(...bones.slice(1));
const geometry = new BufferGeometry();
geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
geometry.setAttribute("skinIndex", new Uint16BufferAttribute(joints, 4));
geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
const character = new SkinnedMesh(
  geometry,
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
);
character.name = "DoodleQuestTestSkinnedHero";
character.add(bones[0]);
character.bind(new Skeleton(bones));
const scene = new Scene();
scene.name = "ExplicitMockAnimationFixture";
scene.add(character);

function rotations(
  name: string,
  axis: "x" | "z",
  times: number[],
  angles: number[],
) {
  const direction = new Vector3(axis === "x" ? 1 : 0, 0, axis === "z" ? 1 : 0);
  const values = angles.flatMap((angle) =>
    new Quaternion().setFromAxisAngle(direction, angle).toArray(),
  );
  return new QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
}
const clips = [
  new AnimationClip("preset:biped:idle", 2, [
    rotations("Head", "z", [0, 1, 2], [-0.06, 0.06, -0.06]),
    rotations("ArmL", "z", [0, 1, 2], [0, -0.08, 0]),
    rotations("ArmR", "z", [0, 1, 2], [0, 0.08, 0]),
  ]),
  new AnimationClip("preset:biped:walk", 1, [
    rotations("ArmL", "x", [0, 0.5, 1], [-0.65, 0.65, -0.65]),
    rotations("ArmR", "x", [0, 0.5, 1], [0.65, -0.65, 0.65]),
    rotations("LegL", "x", [0, 0.5, 1], [0.65, -0.65, 0.65]),
    rotations("LegR", "x", [0, 0.5, 1], [-0.65, 0.65, -0.65]),
    new VectorKeyframeTrack(
      "Root.position",
      [0, 0.25, 0.5, 0.75, 1],
      [0, 0, 0, 0, 0.045, 0, 0, 0, 0, 0, 0.045, 0, 0, 0, 0],
    ),
  ]),
  new AnimationClip("preset:biped:cheer", 2, [
    rotations(
      "ArmL",
      "z",
      [0, 0.35, 0.8, 1.3, 1.65, 2],
      [0, -2.3, -1.9, -2.3, -1.9, 0],
    ),
    rotations(
      "ArmR",
      "z",
      [0, 0.35, 0.8, 1.3, 1.65, 2],
      [0, 2.3, 1.9, 2.3, 1.9, 0],
    ),
    rotations("Head", "z", [0, 0.5, 1, 1.5, 2], [0, -0.12, 0.12, -0.12, 0]),
  ]),
];
const binary = await new GLTFExporter().parseAsync(scene, {
  binary: true,
  animations: clips,
  onlyVisible: true,
});
if (!(binary instanceof ArrayBuffer))
  throw new Error("Expected binary GLB export.");
const bytes = new Uint8Array(binary);
const report = await validateBytes(bytes, { maxIssues: 20 });
if (report.issues.numErrors) throw new Error(JSON.stringify(report.issues));
await mkdir("tests/fixtures", { recursive: true });
await writeFile("tests/fixtures/animated.glb", bytes);
console.log(
  JSON.stringify(
    {
      fixture: "tests/fixtures/animated.glb",
      provenance: "Authored TEST fixture, not Tripo output",
      bytes: bytes.length,
      triangles: positions.length / 9,
      bones: bones.length,
      clips: clips.map((clip) => clip.name),
      validatorErrors: report.issues.numErrors,
      validatorWarnings: report.issues.numWarnings,
    },
    null,
    2,
  ),
);
