"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import DedicationTag from "../DedicationTag";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Vector2, Shape, Group, Mesh, SkinnedMesh, Texture } from "three";
import type { Gift } from "@/domain/config";
import { useGame, movementProgress } from "./store";
import { waypoints } from "@/domain/quest";
import { heroPosition } from "@/domain/wonders";
import {
  advanceHeroMotion,
  heroMotionDelta,
  initialHeroMotion,
  observeHeroQuest,
  pipPose,
  requestHeroMotion,
  type HeroMotion,
  type HeroMotionState,
} from "@/domain/hero-motion";
import { HeroAnimation } from "./HeroAnimation";

type MotionRuntime = {
  state: HeroMotionState;
  delta: number;
  reduced: boolean;
  duration: number;
};
const diagnosticSamples = new WeakMap<
  HTMLCanvasElement,
  { at: number; key: string }
>();
function diagnostics(
  canvas: HTMLCanvasElement,
  runtime: MotionRuntime,
  kind: string,
  pose: () => string,
  animation?: HeroAnimation,
) {
  const at = performance.now();
  const key = `${runtime.state.revision}:${runtime.reduced}:${kind}:${animation?.clipName ?? ""}`;
  const previous = diagnosticSamples.get(canvas);
  if (previous?.key === key && at - previous.at < 100) return;
  diagnosticSamples.set(canvas, { at, key });
  const values = {
    heroMotion: runtime.state.motion,
    heroAnimationTime: runtime.state.time.toFixed(4),
    heroCheers: String(runtime.state.cheers),
    heroKind: kind,
    heroSkinnedMeshes: String(animation?.skinnedMeshes.length ?? 0),
    heroClip: animation?.clipName ?? "",
    heroPose: pose(),
  };
  for (const [name, value] of Object.entries(values))
    if (canvas.dataset[name] !== value) canvas.dataset[name] = value;
}
function fallbackPose(
  group: Group,
  runtime: MotionRuntime,
  movement: Gift["config"]["movement"],
) {
  const { state, reduced } = runtime;
  const t = state.time;
  group.position.y = reduced
    ? 0
    : state.motion === "celebrate"
      ? Math.sin(Math.min(1, state.phaseTime / runtime.duration) * Math.PI) *
        0.2
      : movement === "float"
        ? 0.09 + Math.sin(t * 2) * 0.09
        : movement === "bounce"
          ? Math.abs(Math.sin(t * (state.motion === "walk" ? 8 : 2))) * 0.1
          : 0;
  group.rotation.z = reduced
    ? 0
    : movement === "sway"
      ? Math.sin(t * 2) * 0.07
      : 0;
}
export function Orb({
  position = [0, 0, 0],
  scale = [1, 1, 1],
  color = "#a8cfc0",
  shadow = false,
}: {
  position?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  shadow?: boolean;
}) {
  return (
    <mesh position={position} scale={scale} castShadow={shadow}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
export function Pip({ runtime }: { runtime?: MotionRuntime }) {
  const body = useRef<Group>(null!),
    head = useRef<Group>(null!),
    leftArm = useRef<Group>(null!),
    rightArm = useRef<Group>(null!),
    leftFoot = useRef<Group>(null!),
    rightFoot = useRef<Group>(null!);
  useFrame(({ gl }) => {
    if (!runtime) return;
    const pose = pipPose(runtime.state, runtime.reduced);
    body.current.position.y = pose.height;
    head.current.rotation.z = pose.head;
    leftFoot.current.rotation.x = pose.foot;
    rightFoot.current.rotation.x = -pose.foot;
    leftArm.current.rotation.set(-pose.arm, 0, -pose.armLift);
    rightArm.current.rotation.set(pose.arm, 0, pose.armLift);
    diagnostics(gl.domElement, runtime, "procedural", () =>
      Object.values(pose)
        .map((n) => n.toFixed(4))
        .join(","),
    );
  }, -1);
  return (
    <group ref={body} name="pip-procedural-hero">
      <Orb position={[0, 0.65, 0]} scale={[0.43, 0.52, 0.36]} shadow />
      <group ref={head} position={[0, 1.17, 0.01]}>
        <Orb scale={[0.52, 0.44, 0.43]} shadow />
        <group position={[-0.31, 0.45, -0.03]} rotation={[0, 0, -0.15]}>
          <Orb scale={[0.15, 0.38, 0.14]} />
        </group>
        <group position={[0.32, 0.44, -0.03]} rotation={[0, 0, 0.22]}>
          <Orb scale={[0.15, 0.31, 0.14]} />
        </group>
        <Orb
          position={[-0.2, 0.06, 0.398]}
          scale={[0.038, 0.062, 0.025]}
          color="#304b42"
        />
        <Orb
          position={[0.2, 0.06, 0.398]}
          scale={[0.038, 0.062, 0.025]}
          color="#304b42"
        />
        <Orb
          position={[0, -0.05, 0.428]}
          scale={[0.047, 0.025, 0.025]}
          color="#304b42"
        />
        <Orb
          position={[-0.32, -0.05, 0.34]}
          scale={[0.065, 0.032, 0.025]}
          color="#f1a6a0"
        />
        <Orb
          position={[0.32, -0.05, 0.34]}
          scale={[0.065, 0.032, 0.025]}
          color="#f1a6a0"
        />
      </group>
      <group ref={leftFoot} position={[-0.2, 0.3, 0]}>
        <Orb
          position={[0, -0.17, 0.12]}
          scale={[0.2, 0.13, 0.25]}
          color="#719f89"
        />
      </group>
      <group ref={rightFoot} position={[0.2, 0.3, 0]}>
        <Orb
          position={[0, -0.17, 0.12]}
          scale={[0.2, 0.13, 0.25]}
          color="#719f89"
        />
      </group>
      <group ref={leftArm} position={[-0.46, 0.85, 0]}>
        <Orb position={[0, -0.19, 0]} scale={[0.13, 0.27, 0.15]} />
      </group>
      <group ref={rightArm} position={[0.46, 0.85, 0]}>
        <Orb position={[0, -0.19, 0]} scale={[0.13, 0.27, 0.15]} />
      </group>
      <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.35, 0.075, 8, 30]} />
        <meshStandardMaterial color="#efb95e" />
      </mesh>
      <mesh position={[0.12, 0.69, 0.35]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.17, 0.35, 0.08]} />
        <meshStandardMaterial color="#efb95e" />
      </mesh>
    </group>
  );
}
const modelUsers = new Map<string, number>();
function Loaded({
  url,
  forward,
  onReady,
  runtime,
  movement,
}: {
  url: string;
  forward: number;
  onReady?: () => void;
  runtime: MotionRuntime;
  movement: Gift["config"]["movement"];
}) {
  const fallback = useRef<Group>(null!);
  const gltf = useLoader(GLTFLoader, url, (loader) =>
    loader.setMeshoptDecoder(MeshoptDecoder),
  );
  const animation = useMemo(
    () => new HeroAnimation(gltf.scene, gltf.animations),
    [gltf],
  );
  useEffect(() => {
    runtime.duration = animation.celebrationDuration;
    onReady?.();
  }, [animation, onReady, runtime]);
  useEffect(() => () => animation.dispose(), [animation]);
  useFrame(({ gl }) => {
    const animated = animation.update(
      runtime.state,
      runtime.delta,
      runtime.reduced,
    );
    if (animated) {
      fallback.current.position.y = 0;
      fallback.current.rotation.z = 0;
    } else fallbackPose(fallback.current, runtime, movement);
    diagnostics(
      gl.domElement,
      runtime,
      animated ? "clips" : "fallback",
      () =>
        animation.pose() ||
        `${fallback.current.position.y.toFixed(4)},${fallback.current.rotation.z.toFixed(4)}`,
      animation,
    );
  }, -1);
  useEffect(() => {
    modelUsers.set(url, (modelUsers.get(url) || 0) + 1);
    return () => {
      modelUsers.set(url, (modelUsers.get(url) || 1) - 1);
      queueMicrotask(() => {
        if (modelUsers.get(url) !== 0) return;
        gltf.scene.traverse((node) => {
          if (node instanceof SkinnedMesh) node.skeleton.dispose();
          if (node instanceof Mesh) {
            node.geometry.dispose();
            for (const material of Array.isArray(node.material)
              ? node.material
              : [node.material]) {
              for (const value of Object.values(material))
                if (value instanceof Texture) value.dispose();
              material.dispose();
            }
          }
        });
        useLoader.clear(GLTFLoader, url);
        modelUsers.delete(url);
      });
    };
  }, [gltf, url]);
  return (
    <group ref={fallback}>
      <group rotation={[0, (forward * Math.PI) / 180, 0]}>
        <primitive object={animation.normalized} dispose={null} />
      </group>
    </group>
  );
}
export function Character({
  gift,
  showcase = false,
  previewMotion,
  onReady,
}: {
  gift: Gift;
  showcase?: boolean;
  previewMotion?: { name: HeroMotion; request: number };
  onReady?: () => void;
}) {
  const wrapper = useRef<Group>(null!);
  const runtime = useMemo<MotionRuntime>(
    () => ({
      state: initialHeroMotion(),
      delta: 0,
      reduced: false,
      duration: 2,
    }),
    [gift.modelUrl, showcase],
  );
  const systemReduced = useRef(false);
  const resumed = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      systemReduced.current = media.matches;
    };
    const visibility = () => {
      if (document.hidden) resumed.current = true;
    };
    preference();
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const previewName = previewMotion?.name;
  const previewRequest = previewMotion?.request;
  useEffect(() => {
    if (showcase) return;
    return useGame.subscribe((after, before) => {
      runtime.state = observeHeroQuest(
        runtime.state,
        before.game,
        after.game,
        after.reduced,
      );
    });
  }, [runtime, showcase]);
  useEffect(() => {
    if (showcase && previewName)
      runtime.state = requestHeroMotion(
        runtime.state,
        useGame.getState().reduced || systemReduced.current
          ? "idle"
          : previewName,
      );
  }, [runtime, showcase, previewName, previewRequest]);
  useEffect(() => {
    if (!gift.modelUrl) onReady?.();
  }, [gift.modelUrl, onReady]);
  useFrame((_, delta) => {
    const { game, reduced: settingReduced } = useGame.getState();
    const reduced = settingReduced || (showcase && systemReduced.current);
    const hidden = document.hidden;
    const frame = {
      delta: resumed.current ? 0 : delta,
      moving: showcase ? previewName === "walk" : Boolean(game.target),
      paused: !showcase && game.paused,
      hidden,
      reduced,
      celebrationDuration: runtime.duration,
    };
    resumed.current = hidden;
    runtime.delta = heroMotionDelta(frame);
    runtime.reduced = reduced;
    runtime.state = advanceHeroMotion(runtime.state, frame);
    if (!showcase) {
      const a = waypoints[game.location],
        b = game.target ? waypoints[game.target] : a;
      heroPosition(wrapper.current.position, game, movementProgress.current);
      wrapper.current.rotation.y = game.target
        ? Math.atan2(b[0] - a[0], b[2] - a[2])
        : 0.2;
    }
  }, -2);
  return (
    <group ref={wrapper} scale={showcase ? 1 : 0.72}>
      {gift.modelUrl ? (
        <Loaded
          url={gift.modelUrl}
          forward={gift.config.forward}
          onReady={onReady}
          runtime={runtime}
          movement={gift.config.movement}
        />
      ) : (
        <group rotation={[0, (gift.config.forward * Math.PI) / 180, 0]}>
          <Pip runtime={runtime} />
        </group>
      )}
      {!showcase && <CarriedStar dedication={gift.config.dedication} />}
    </group>
  );
}
function CarriedStar({ dedication }: { dedication: string }) {
  const has = useGame((s) => s.game.hasStar);
  return has ? (
    <group>
      <Star position={[0, 2.45, 0]} size={0.3} />
      {dedication?.trim() && (
        <Html
          position={[0, 3.55, 0]}
          zIndexRange={[3, 0]}
          style={{ pointerEvents: "none", transform: "translate(-50%, -100%)" }}
        >
          <DedicationTag text={dedication} variant="carried" />
        </Html>
      )}
    </group>
  ) : null;
}
export function Star({
  position = [0, 0, 0],
  size = 0.4,
}: {
  position?: [number, number, number];
  size?: number;
}) {
  const shape = useMemo(
    () =>
      new Shape(
        Array.from({ length: 10 }, (_, i) => {
          const a = (i * Math.PI) / 5 + Math.PI / 2,
            r = i % 2 ? 0.45 : 1;
          return new Vector2(Math.cos(a) * r, Math.sin(a) * r);
        }),
      ),
    [],
  );
  return (
    <mesh position={position} scale={size}>
      <extrudeGeometry
        args={[
          shape,
          {
            depth: 0.2,
            bevelEnabled: true,
            bevelThickness: 0.08,
            bevelSize: 0.08,
            bevelSegments: 2,
            steps: 1,
          },
        ]}
      />
      <meshStandardMaterial
        color="#f6c35e"
        emissive="#eab448"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}
