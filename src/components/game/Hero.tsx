"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Box3, Vector3, Vector2, Shape, Group, Mesh, Texture } from "three";
import type { Gift } from "@/domain/config";
import { useGame, movementProgress } from "./store";
import { waypoints } from "@/domain/quest";
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
export function Pip() {
  return (
    <group>
      <Orb position={[0, 0.65, 0]} scale={[0.43, 0.52, 0.36]} shadow />
      <Orb position={[0, 1.17, 0.01]} scale={[0.52, 0.44, 0.43]} shadow />
      <group position={[-0.31, 1.62, -0.02]} rotation={[0, 0, -0.15]}>
        <Orb scale={[0.15, 0.38, 0.14]} />
      </group>
      <group position={[0.32, 1.61, -0.02]} rotation={[0, 0, 0.22]}>
        <Orb scale={[0.15, 0.31, 0.14]} />
      </group>
      <Orb
        position={[-0.2, 0.13, 0.12]}
        scale={[0.2, 0.13, 0.25]}
        color="#719f89"
      />
      <Orb
        position={[0.2, 0.13, 0.12]}
        scale={[0.2, 0.13, 0.25]}
        color="#719f89"
      />
      <Orb position={[-0.46, 0.66, 0]} scale={[0.13, 0.27, 0.15]} />
      <Orb position={[0.46, 0.66, 0]} scale={[0.13, 0.27, 0.15]} />
      <Orb
        position={[-0.2, 1.23, 0.408]}
        scale={[0.038, 0.062, 0.025]}
        color="#304b42"
      />
      <Orb
        position={[0.2, 1.23, 0.408]}
        scale={[0.038, 0.062, 0.025]}
        color="#304b42"
      />
      <Orb
        position={[0, 1.12, 0.438]}
        scale={[0.047, 0.025, 0.025]}
        color="#304b42"
      />
      <Orb
        position={[-0.32, 1.12, 0.35]}
        scale={[0.065, 0.032, 0.025]}
        color="#f1a6a0"
      />
      <Orb
        position={[0.32, 1.12, 0.35]}
        scale={[0.065, 0.032, 0.025]}
        color="#f1a6a0"
      />
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
}: {
  url: string;
  forward: number;
  onReady?: () => void;
}) {
  const gltf = useLoader(GLTFLoader, url, (loader) =>
    loader.setMeshoptDecoder(MeshoptDecoder),
  );
  const normalized = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root),
      size = box.getSize(new Vector3()),
      center = box.getCenter(new Vector3());
    const scale = 1.8 / Math.max(size.x, size.y, size.z, 0.001);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    root.scale.setScalar(scale);
    return root;
  }, [gltf]);
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  useEffect(() => {
    modelUsers.set(url, (modelUsers.get(url) || 0) + 1);
    return () => {
      modelUsers.set(url, (modelUsers.get(url) || 1) - 1);
      queueMicrotask(() => {
        if (modelUsers.get(url) !== 0) return;
        gltf.scene.traverse((node) => {
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
    <group rotation={[0, (forward * Math.PI) / 180, 0]}>
      <primitive object={normalized} />
    </group>
  );
}
export function Character({
  gift,
  showcase = false,
  onReady,
}: {
  gift: Gift;
  showcase?: boolean;
  onReady?: () => void;
}) {
  const wrapper = useRef<Group>(null!),
    motion = useRef<Group>(null!);
  const reduced = useGame((s) => s.reduced);
  useFrame(({ clock }) => {
    if (!wrapper.current) return;
    const { game } = useGame.getState();
    const t = clock.elapsedTime;
    if (!showcase) {
      const a = waypoints[game.location],
        b = game.target ? waypoints[game.target] : a;
      const p = Math.min(movementProgress.current / 2.4, 1);
      wrapper.current.position.set(
        a[0] + (b[0] - a[0]) * p,
        0.22,
        a[2] + (b[2] - a[2]) * p,
      );
      wrapper.current.rotation.y = game.target
        ? Math.atan2(b[0] - a[0], b[2] - a[2])
        : 0.2;
    }
    if (!game.paused && !reduced) {
      motion.current.position.y =
        gift.config.movement === "float"
          ? 0.09 + Math.sin(t * 2) * 0.09
          : gift.config.movement === "bounce"
            ? Math.abs(Math.sin(t * (game.target ? 8 : 2))) * 0.1
            : 0;
      motion.current.rotation.z =
        gift.config.movement === "sway" ? Math.sin(t * 2) * 0.07 : 0;
    }
  });
  return (
    <group ref={wrapper} scale={showcase ? 1 : 0.72}>
      <group ref={motion}>
        {gift.modelUrl ? (
          <Loaded
            url={gift.modelUrl}
            forward={gift.config.forward}
            onReady={onReady}
          />
        ) : (
          <group rotation={[0, (gift.config.forward * Math.PI) / 180, 0]}>
            <Pip />
          </group>
        )}
        {!showcase && <CarriedStar />}
      </group>
    </group>
  );
}
function CarriedStar() {
  const has = useGame((s) => s.game.hasStar);
  return has ? <Star position={[0, 2.45, 0]} size={0.3} /> : null;
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
