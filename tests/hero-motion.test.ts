import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SkinnedMesh,
  VectorKeyframeTrack,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  advanceHeroMotion,
  heroMotionDelta,
  heroReaction,
  initialHeroMotion,
  observeHeroQuest,
  pipPose,
  requestHeroMotion,
  resolveHeroClips,
  type HeroMotionFrame,
} from "../src/domain/hero-motion";
import { initialQuest, quest, type Action } from "../src/domain/quest";
import { HeroAnimation } from "../src/components/game/HeroAnimation";

const frame: HeroMotionFrame = {
  delta: 0.1,
  moving: false,
  paused: false,
  hidden: false,
  reduced: false,
};
function adventure() {
  let game = initialQuest(),
    motion = initialHeroMotion();
  return {
    get game() {
      return game;
    },
    get motion() {
      return motion;
    },
    act(action: Action, reduced = false) {
      const before = game;
      game = quest(game, action);
      motion = observeHeroQuest(motion, before, game, reduced);
      return heroReaction(before, game);
    },
    step(overrides: Partial<HeroMotionFrame> = {}) {
      motion = advanceHeroMotion(motion, {
        ...frame,
        moving: Boolean(game.target),
        ...overrides,
      });
    },
    go(to: "bells" | "garden" | "mailbox") {
      this.act({ type: "go", to });
      this.act({ type: "tick", delta: 2.4 });
    },
    gate() {
      this.act({ type: "open" });
      this.go("bells");
      this.act({ type: "bell", bell: "circle" });
      this.act({ type: "bell", bell: "triangle" });
      return this.act({ type: "bell", bell: "star" });
    },
  };
}

describe("hero motion follows accepted quest transitions", () => {
  it("celebrates each of the three milestones once, never on duplicate interactions or rerenders", () => {
    const run = adventure();
    expect(run.gate()).toBe("gate");
    expect(run.motion.cheers).toBe(1);
    const first = run.motion;
    expect(run.act({ type: "bell", bell: "star" })).toBeNull();
    expect(run.motion).toBe(first);
    expect(
      observeHeroQuest(first, { ...run.game }, { ...run.game }, false),
    ).toBe(first);
    run.go("garden");
    expect(run.act({ type: "interact" })).toBe("star");
    expect(run.motion.cheers).toBe(2);
    expect(run.act({ type: "interact" })).toBeNull();
    run.go("mailbox");
    expect(run.act({ type: "interact" })).toBe("delivery");
    expect(run.motion.cheers).toBe(3);
    expect(run.act({ type: "interact" })).toBeNull();
    expect(run.motion.cheers).toBe(3);
  });

  it("ignores wrong, distant, moving and paused interactions", () => {
    const run = adventure();
    run.act({ type: "open" });
    expect(run.act({ type: "bell", bell: "star" })).toBeNull();
    run.act({ type: "go", to: "bells" });
    expect(run.act({ type: "bell", bell: "circle" })).toBeNull();
    run.act({ type: "tick", delta: 2.4 });
    expect(run.act({ type: "bell", bell: "triangle" })).toBeNull();
    run.act({ type: "bell", bell: "circle" });
    run.act({ type: "bell", bell: "triangle" });
    run.act({ type: "pause" });
    expect(run.act({ type: "bell", bell: "star" })).toBeNull();
    expect(run.motion.cheers).toBe(0);
  });

  it("walks only during travel and immediately interrupts a cheer without holding navigation", () => {
    const run = adventure();
    run.gate();
    run.step();
    expect(run.motion.motion).toBe("celebrate");
    run.act({ type: "go", to: "garden" });
    run.step();
    expect(run.motion.motion).toBe("walk");
    run.act({ type: "tick", delta: 2.4 });
    run.step();
    expect(run.motion.motion).toBe("idle");
    expect(run.motion.cheers).toBe(1);
  });

  it("returns to idle after one complete reaction and resets clocks and count on replay", () => {
    const run = adventure();
    run.gate();
    for (let i = 0; i < 25; i++) run.step();
    expect(run.motion.motion).toBe("idle");
    expect(run.motion.cheers).toBe(1);
    const revision = run.motion.revision;
    run.act({ type: "pause" });
    run.act({ type: "replay" });
    expect(run.motion).toEqual({
      ...initialHeroMotion(),
      revision: revision + 1,
    });
    run.gate();
    expect(run.motion.cheers).toBe(1);
    expect(run.motion.motion).toBe("celebrate");
  });

  it.each(["paused", "hidden"] as const)(
    "freezes the entire motion clock when %s",
    (key) => {
      let motion = requestHeroMotion(initialHeroMotion(), "celebrate");
      motion = advanceHeroMotion(motion, frame);
      expect(
        advanceHeroMotion(motion, {
          ...frame,
          [key]: true,
          moving: true,
          delta: 20,
        }),
      ).toBe(motion);
      expect(heroMotionDelta({ ...frame, [key]: true })).toBe(0);
    },
  );

  it("settles for reduced motion and does not replay a suppressed reaction later", () => {
    const run = adventure();
    run.gate();
    run.step();
    const elapsed = run.motion.time;
    run.step({ reduced: true, moving: true });
    expect(run.motion.motion).toBe("idle");
    expect(run.motion.phaseTime).toBe(0);
    expect(run.motion.time).toBe(elapsed);
    run.step();
    expect(run.motion.motion).toBe("idle");
    run.go("garden");
    run.act({ type: "interact" }, true);
    expect(run.motion.cheers).toBe(1);
    run.step();
    expect(run.motion.motion).toBe("idle");
  });

  it("caps elapsed time and ignores invalid and negative deltas", () => {
    expect(heroMotionDelta({ ...frame, delta: 30 })).toBe(0.1);
    expect(heroMotionDelta({ ...frame, delta: -1 })).toBe(0);
    expect(heroMotionDelta({ ...frame, delta: NaN })).toBe(0);
    expect(heroMotionDelta({ ...frame, delta: Infinity })).toBe(0);
  });

  it("supports explicit preview requests with independent one-shots", () => {
    let motion = requestHeroMotion(initialHeroMotion(), "celebrate");
    motion = advanceHeroMotion(motion, frame);
    const again = requestHeroMotion(motion, "celebrate");
    expect(again.cheers).toBe(2);
    expect(again.phaseTime).toBe(0);
    expect(again.revision).toBeGreaterThan(motion.revision);
  });
});

describe("supported clip resolution and procedural fallback", () => {
  it("matches Tripo biped and creature names, common imports and victory celebrations", () => {
    const clips = [
      "preset:biped:idle",
      "preset:biped:walk",
      "preset:biped:cheer",
    ].map((name) => ({ name }));
    expect(resolveHeroClips(clips)).toEqual({
      idle: clips[0],
      walk: clips[1],
      celebrate: clips[2],
    });
    expect(
      resolveHeroClips([{ name: "preset:creature:march" }]).walk?.name,
    ).toBe("preset:creature:march");
    expect(
      resolveHeroClips([{ name: "preset:creature:walk" }]).walk?.name,
    ).toBe("preset:creature:walk");
    expect(
      resolveHeroClips([{ name: "preset:biped:victory_celebration" }])
        .celebrate,
    ).toBeDefined();
    expect(
      resolveHeroClips([{ name: "Armature|Idle.001" }]).idle,
    ).toBeDefined();
  });

  it("leaves unknown and partial models available for per-action fallback", () => {
    expect(
      resolveHeroClips([
        { name: "Take 001" },
        { name: "breakdance" },
        { name: "walk backwards" },
      ]),
    ).toEqual({});
    const idle = { name: "idle" };
    expect(resolveHeroClips([idle, { name: "Idle" }])).toEqual({ idle });
  });

  it("articulates Pip's limbs and head and settles every part for reduced motion", () => {
    const walking = {
      ...initialHeroMotion(),
      motion: "walk" as const,
      phaseTime: 0.15,
    };
    expect(Math.abs(pipPose(walking, false).foot)).toBeGreaterThan(0.4);
    expect(Math.abs(pipPose(walking, false).arm)).toBeGreaterThan(0.3);
    const cheering = {
      ...walking,
      motion: "celebrate" as const,
      phaseTime: 0.4,
    };
    expect(pipPose(cheering, false).armLift).toBeGreaterThan(2);
    expect(pipPose(cheering, false).height).toBeGreaterThan(0);
    expect(pipPose(cheering, true)).toEqual({
      foot: 0,
      arm: 0,
      armLift: 0,
      head: 0,
      height: 0,
    });
  });
});

async function fixture() {
  const bytes = await readFile(
    new URL("./fixtures/animated.glb", import.meta.url),
  );
  return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
}

describe("independent skeletal animation playback", () => {
  it("animates real bones while preserving the cached source and a second canvas", async () => {
    const gltf = await fixture();
    const first = new HeroAnimation(gltf.scene, gltf.animations);
    const second = new HeroAnimation(gltf.scene, gltf.animations);
    expect(first.skinnedMeshes).toHaveLength(1);
    const source = gltf.scene.getObjectByProperty(
      "type",
      "SkinnedMesh",
    ) as SkinnedMesh;
    expect(first.skinnedMeshes[0].skeleton).not.toBe(source.skeleton);
    expect(first.skinnedMeshes[0].skeleton.bones[0]).not.toBe(
      source.skeleton.bones[0],
    );
    expect(first.skinnedMeshes[0].skeleton.bones[0]).not.toBe(
      second.skinnedMeshes[0].skeleton.bones[0],
    );
    const initialPose = second.pose();
    const sourcePose = source.skeleton.bones.map((bone) =>
      bone.quaternion.toArray(),
    );
    const walk = requestHeroMotion(initialHeroMotion(), "walk");
    first.update(walk, 0.25, false);
    expect(first.pose()).not.toBe(initialPose);
    expect(second.pose()).toBe(initialPose);
    expect(
      source.skeleton.bones.map((bone) => bone.quaternion.toArray()),
    ).toEqual(sourcePose);
    const geometryDispose = vi.spyOn(source.geometry, "dispose");
    first.dispose();
    expect(geometryDispose).not.toHaveBeenCalled();
    second.update(walk, 0.25, false);
    expect(second.pose()).not.toBe(initialPose);
    second.dispose();
  });

  it("crossfades idle and walk, plays the cheer once and holds reduced motion on the idle pose", async () => {
    const gltf = await fixture();
    const hero = new HeroAnimation(gltf.scene, gltf.animations);
    let state = initialHeroMotion();
    hero.update(state, 0.2, false);
    const idle = hero.mixer.clipAction(hero.clips.idle!);
    state = requestHeroMotion(state, "walk");
    hero.update(state, 0.09, false);
    const walk = hero.mixer.clipAction(hero.clips.walk!);
    expect(idle.getEffectiveWeight()).toBeGreaterThan(0);
    expect(idle.getEffectiveWeight()).toBeLessThan(1);
    expect(walk.getEffectiveWeight()).toBeGreaterThan(0);
    expect(walk.getEffectiveWeight()).toBeLessThan(1);
    state = requestHeroMotion(state, "celebrate");
    hero.update(state, 0.5, false);
    const cheer = hero.mixer.clipAction(hero.clips.celebrate!);
    hero.update(state, 0.5, false);
    expect(cheer.time).toBe(1);
    hero.update(state, 1.2, false);
    expect(cheer.time).toBe(2);
    expect(cheer.paused).toBe(true);
    hero.update(state, 1, true);
    expect(hero.clipName).toBe("preset:biped:idle");
    const settled = hero.pose();
    hero.update(state, 10, true);
    expect(hero.pose()).toBe(settled);
    hero.dispose();
  });

  it("freezes the bone pose with zero delta and restores usable actions after cleanup/remount", async () => {
    const gltf = await fixture();
    const hero = new HeroAnimation(gltf.scene, gltf.animations);
    const walk = requestHeroMotion(initialHeroMotion(), "walk");
    hero.update(walk, 0.25, false);
    const pose = hero.pose();
    hero.update(walk, 0, false);
    expect(hero.pose()).toBe(pose);
    hero.dispose();
    hero.update(walk, 0.25, false);
    expect(hero.pose()).toBe(pose);
    hero.dispose();
  });

  it("keeps normalization outside the hierarchy when a clip animates the model root", () => {
    const scene = new Group();
    scene.name = "AnimatedRoot";
    scene.add(new Mesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial()));
    const clip = new AnimationClip("idle", 1, [
      new VectorKeyframeTrack(
        "AnimatedRoot.position",
        [0, 1],
        [0, 0, 0, 0, 1, 0],
      ),
    ]);
    const hero = new HeroAnimation(scene, [clip]);
    const scale = hero.normalized.scale.clone();
    const offset = hero.normalized.children[0].position.clone();
    expect(hero.update(initialHeroMotion(), 0.5, false)).toBe(true);
    expect(hero.scene.position.y).toBeCloseTo(0.5);
    expect(hero.normalized.scale).toEqual(scale);
    expect(hero.normalized.children[0].position).toEqual(offset);
    expect(scene.position.y).toBe(0);
    expect(
      hero.update(requestHeroMotion(initialHeroMotion(), "walk"), 0.1, false),
    ).toBe(false);
    expect(hero.clipName).toBe("");
    hero.dispose();
  });
});
