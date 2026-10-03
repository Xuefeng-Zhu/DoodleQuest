import {
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { resolveHeroClips, type HeroMotionState } from "@/domain/hero-motion";

/** Each canvas owns its bones and mixer. Geometry/materials remain in the loader cache. */
export class HeroAnimation {
  readonly scene: Object3D;
  readonly normalized: Group;
  readonly mixer: AnimationMixer;
  readonly clips;
  readonly skinnedMeshes: SkinnedMesh[] = [];
  private readonly diagnosticBones;
  private active: AnimationAction | null = null;
  private token = "";

  constructor(source: Object3D, animations: readonly AnimationClip[]) {
    this.scene = clone(source);
    this.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(this.scene);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = 1.8 / Math.max(size.x, size.y, size.z, 0.001);
    // Keep normalization outside the animated hierarchy: a root position/scale track
    // must not overwrite normalization or waypoint travel.
    this.normalized = new Group();
    this.normalized.scale.setScalar(scale);
    const offset = new Group();
    offset.position.set(-center.x, -box.min.y, -center.z);
    offset.add(this.scene);
    this.normalized.add(offset);
    this.scene.traverse((node) => {
      if (node instanceof SkinnedMesh) this.skinnedMeshes.push(node);
    });
    const bones = [
      ...new Set(this.skinnedMeshes.flatMap((mesh) => mesh.skeleton.bones)),
    ];
    this.diagnosticBones =
      bones.length <= 12
        ? bones
        : Array.from(
            { length: 12 },
            (_, i) => bones[Math.floor((i * (bones.length - 1)) / 11)],
          );
    this.mixer = new AnimationMixer(this.scene);
    this.clips = resolveHeroClips(
      animations.filter(
        (clip) =>
          clip.tracks.length > 0 &&
          Number.isFinite(clip.duration) &&
          clip.duration > 0,
      ),
    );
  }

  get celebrationDuration() {
    return this.clips.celebrate?.duration ?? 2;
  }
  get clipName() {
    return this.active?.getClip().name ?? "";
  }

  update(state: HeroMotionState, delta: number, reduced: boolean) {
    const motion = reduced ? "idle" : state.motion;
    const clip = this.clips[motion];
    const token = `${state.revision}:${motion}:${reduced}`;
    if (token !== this.token) {
      this.token = token;
      if (!clip || reduced) {
        this.mixer.stopAllAction();
        this.active = null;
      }
      if (clip) {
        const previous = this.active;
        const next = this.mixer.clipAction(clip);
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
        next.setLoop(
          motion === "celebrate" ? LoopOnce : LoopRepeat,
          motion === "celebrate" ? 1 : Infinity,
        );
        next.clampWhenFinished = motion === "celebrate";
        if (previous && previous !== next) {
          previous.fadeOut(0.18);
          next.fadeIn(0.18);
        }
        next.play();
        this.active = next;
      }
    }
    this.mixer.update(reduced ? 0 : delta);
    return Boolean(clip);
  }

  /** A compact read-only signature lets browser tests verify actual bone poses. */
  pose() {
    return this.diagnosticBones
      .map((bone) =>
        [...bone.position.toArray(), ...bone.quaternion.toArray()]
          .map((n) => n.toFixed(4))
          .join(","),
      )
      .join(";");
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.scene);
    this.active = null;
    this.token = "";
    for (const skeleton of new Set(
      this.skinnedMeshes.map((mesh) => mesh.skeleton),
    ))
      skeleton.dispose();
  }
}
