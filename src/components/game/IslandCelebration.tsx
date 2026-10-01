"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  Color,
  Vector3,
  type DirectionalLight,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { advanceCelebration, celebrationEase } from "@/domain/celebration";
import { useGame } from "./store";
import { Orb, Star } from "./Hero";

function useCelebration(active: boolean, duration: number) {
  const progress = useRef(0);
  useFrame((_, delta) => {
    const { reduced, game } = useGame.getState();
    progress.current = advanceCelebration(progress.current, active, delta, {
      reduced,
      paused: game.paused || document.hidden,
      duration,
    });
  });
  return progress;
}

const paper = new Color("#f4e5c6");
const gold = new Color("#f1bb48");
const white = new Color("#ffffff");
const sunlight = new Color("#ffe1aa");

function RibbonSection({
  curve,
  active,
  index,
}: {
  curve: CatmullRomCurve3;
  active: boolean;
  index: number;
}) {
  const material = useRef<MeshStandardMaterial>(null);
  const progress = useCelebration(active, 0.7);
  useFrame(() => {
    if (!material.current) return;
    const amount = celebrationEase(progress.current);
    material.current.color.copy(paper).lerp(gold, amount);
    material.current.emissiveIntensity = amount * 0.3;
  });
  return (
    <mesh name={`ribbon-light-${index + 1}`} userData={{ lit: active }}>
      <tubeGeometry args={[curve, 24, 0.3, 8, false]} />
      <meshStandardMaterial
        ref={material}
        color="#f4e5c6"
        emissive="#ffd46a"
        emissiveIntensity={0}
        roughness={1}
      />
    </mesh>
  );
}

export function ProgressRibbon({ lights }: { lights: number }) {
  const sections = useMemo(() => {
    const ribbon = new CatmullRomCurve3([
      new Vector3(-4, 0.24, 2.6),
      new Vector3(-2.5, 0.24, 0.2),
      new Vector3(0.1, 0.24, -1.9),
      new Vector3(2, 0.24, -0.7),
      new Vector3(3, 0.24, 1.2),
    ]);
    return [0, 1, 2].map(
      (section) =>
        new CatmullRomCurve3(
          Array.from({ length: 17 }, (_, i) =>
            ribbon.getPointAt((section + i / 16) / 3),
          ),
        ),
    );
  }, []);
  return (
    <group name="progress-ribbon">
      {sections.map((curve, i) => (
        <RibbonSection key={i} index={i} curve={curve} active={i < lights} />
      ))}
    </group>
  );
}

export function GardenFlower({
  x,
  z,
  color,
  bloom,
  index,
}: {
  x: number;
  z: number;
  color: string;
  bloom: boolean;
  index: number;
}) {
  const head = useRef<Group>(null);
  const stem = useRef<Mesh>(null);
  const petals = useRef<Group>(null);
  const progress = useCelebration(bloom, 1 + index * 0.12);
  useFrame(() => {
    const amount = celebrationEase(progress.current);
    if (head.current) {
      head.current.position.y = 0.5 + amount * 0.32;
      head.current.rotation.z = (1 - amount) * 0.12;
    }
    if (stem.current) {
      stem.current.scale.y = 0.7 + amount * 0.45;
      stem.current.position.y = 0.22 + amount * 0.13;
    }
    petals.current?.children.forEach((petal, i) => {
      const angle = (i * Math.PI * 2) / 5;
      petal.position.set(
        Math.cos(angle) * (0.045 + amount * 0.23),
        Math.sin(angle) * (0.055 + amount * 0.22),
        (1 - amount) * 0.1,
      );
      petal.scale.set(0.085 + amount * 0.095, 0.16 + amount * 0.035, 0.09);
      petal.rotation.z = angle - Math.PI / 2;
    });
  });
  return (
    <group
      position={[x, 0.2, z]}
      scale={0.95}
      name={`garden-flower-${index}`}
      userData={{ bloom }}
    >
      <mesh ref={stem} position={[0, 0.22, 0]} scale={[1, 0.7, 1]}>
        <cylinderGeometry args={[0.035, 0.045, 0.6, 6]} />
        <meshStandardMaterial color="#648d68" />
      </mesh>
      <Orb
        position={[0.15, 0.2, 0]}
        scale={[0.18, 0.065, 0.07]}
        color="#86ad75"
      />
      <group ref={head} position={[0, 0.5, 0]}>
        <group ref={petals}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color={color} roughness={0.85} />
            </mesh>
          ))}
        </group>
        <Orb
          position={[0, 0, 0.085]}
          scale={[0.115, 0.115, 0.08]}
          color="#fff4cb"
        />
      </group>
    </group>
  );
}

export function CelebrationSun({
  delivered,
  low,
}: {
  delivered: boolean;
  low: boolean;
}) {
  const light = useRef<DirectionalLight>(null);
  const progress = useCelebration(delivered, 1.8);
  useFrame(() => {
    if (light.current)
      light.current.color
        .copy(white)
        .lerp(sunlight, celebrationEase(progress.current) * 0.7);
  });
  return (
    <directionalLight
      ref={light}
      position={[-3, 9, 6]}
      intensity={2.5}
      castShadow={!low}
      shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-8}
      shadow-camera-right={8}
      shadow-camera-top={8}
      shadow-camera-bottom={-8}
    />
  );
}

export function IslandGlow({
  delivered,
  grass,
}: {
  delivered: boolean;
  grass: string;
}) {
  const ground = useRef<MeshStandardMaterial>(null);
  const rim = useRef<MeshBasicMaterial>(null);
  const stars = useRef<Group>(null);
  const base = useMemo(() => new Color(grass), [grass]);
  const progress = useCelebration(delivered, 1.8);
  useFrame(() => {
    const amount = celebrationEase(progress.current);
    if (ground.current) {
      ground.current.color.copy(base).lerp(sunlight, amount * 0.48);
      ground.current.emissiveIntensity = amount * 0.16;
    }
    if (rim.current) rim.current.opacity = amount * 0.8;
    if (stars.current) {
      stars.current.visible = amount > 0;
      stars.current.scale.setScalar(amount);
      stars.current.position.y = amount * 0.35;
    }
  });
  return (
    <>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[5.35, 5.25, 0.38, 64]} />
        <meshStandardMaterial
          ref={ground}
          color={grass}
          emissive="#ffd991"
          emissiveIntensity={0}
        />
      </mesh>
      <mesh
        position={[0, 0.24, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        name="celebration-rim"
      >
        <torusGeometry args={[5.2, 0.045, 6, 80]} />
        <meshBasicMaterial
          ref={rim}
          color="#ffe5a1"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <group ref={stars} visible={false} scale={0} name="delivery-starlight">
        {[
          [-3.8, 1.1, 2.1],
          [-3.7, 1.5, -1.8],
          [-0.5, 1.1, -3.8],
          [2.5, 1.6, -2.6],
          [4.1, 1.3, 1.2],
          [0.2, 1.05, 3.8],
        ].map(([x, y, z], i) => (
          <Star key={i} position={[x, y, z]} size={i % 2 ? 0.12 : 0.17} />
        ))}
      </group>
    </>
  );
}
