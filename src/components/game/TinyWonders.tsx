"use client";
import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import { Vector3, type Group } from "three";
import {
  canDiscover,
  heroPosition,
  wonderDuration,
  wonderEnvelope,
  wonderHomes,
  type Wonder,
} from "@/domain/wonders";
import { useGame, movementProgress, wonderTime } from "./store";
import { Orb } from "./Hero";

function useTouch(id: Wonder) {
  const [hover, setHover] = useState(false);
  const enabled = useGame((s) => canDiscover(s.game));
  useCursor(hover && enabled);
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      if (enabled) {
        e.stopPropagation();
        setHover(true);
      }
    },
    onPointerOut: () => setHover(false),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (!enabled) return;
      e.stopPropagation();
      useGame.getState().discover(id);
    },
  };
}
function TouchArea({ radius = 0.65 }: { radius?: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 8, 6]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
    </mesh>
  );
}

function SleepyFlower({ color }: { color: string }) {
  const petals = useRef<Group>(null),
    head = useRef<Group>(null);
  const touch = useTouch("flower");
  useFrame(() => {
    const { wonders, reduced } = useGame.getState();
    const amount = wonders.flower
      ? wonderEnvelope(wonderTime.flower, wonderDuration.flower, reduced)
      : 0;
    if (head.current) head.current.rotation.z = (1 - amount) * -0.22;
    petals.current?.children.forEach((petal, i) => {
      const a = (i * Math.PI * 2) / 6;
      petal.position.set(
        Math.cos(a) * (0.07 + amount * 0.28),
        Math.sin(a) * (0.09 + amount * 0.27),
        (1 - amount) * 0.13,
      );
      petal.scale.set(0.12 + amount * 0.06, 0.24, 0.1);
      petal.rotation.z = a - Math.PI / 2;
    });
  });
  return (
    <group position={wonderHomes.flower} name="wonder-flower" {...touch}>
      <mesh position={[0, -0.37, 0]}>
        <cylinderGeometry args={[0.045, 0.06, 0.72, 6]} />
        <meshStandardMaterial color="#668b66" />
      </mesh>
      <Orb
        position={[0.18, -0.39, 0]}
        scale={[0.25, 0.07, 0.1]}
        color="#82aa72"
      />
      <group ref={head}>
        <group ref={petals}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          ))}
        </group>
        <Orb
          position={[0, 0, 0.16]}
          scale={[0.16, 0.16, 0.1]}
          color="#fff2bb"
        />
        {[-1, 1].map((i) => (
          <Orb
            key={i}
            position={[i * 0.055, 0.025, 0.255]}
            scale={[0.018, 0.025, 0.012]}
            color="#6b7045"
          />
        ))}
      </group>
      <TouchArea radius={0.8} />
    </group>
  );
}

function TickleCloud() {
  const cloud = useRef<Group>(null),
    puff = useRef<Group>(null);
  const touch = useTouch("cloud");
  useFrame(() => {
    const { wonders, reduced } = useGame.getState();
    const t = wonderTime.cloud;
    const amount = wonders.cloud
      ? wonderEnvelope(t, wonderDuration.cloud, reduced)
      : 0;
    if (cloud.current)
      cloud.current.scale.set(1 + amount * 0.12, 1 - amount * 0.1, 1);
    if (puff.current) {
      puff.current.visible = wonders.cloud;
      puff.current.position.set(
        -0.65 - (reduced ? 0.3 : t * 0.4),
        0.25 + (reduced ? 0.15 : t * 0.25),
        0,
      );
      puff.current.scale.setScalar(amount * 0.6);
    }
  });
  return (
    <group position={wonderHomes.cloud} name="wonder-cloud" {...touch}>
      <group ref={cloud}>
        {[-1, 0, 1].map((i) => (
          <Orb
            key={i}
            position={[i * 0.4, i === 0 ? 0.08 : 0, 0]}
            scale={[0.43, i === 0 ? 0.32 : 0.23, 0.26]}
            color="#fffaf0"
          />
        ))}
        {[-1, 1].map((i) => (
          <Orb
            key={i}
            position={[i * 0.12, 0.04, 0.25]}
            scale={[0.023, 0.032, 0.02]}
            color="#829482"
          />
        ))}
      </group>
      <group ref={puff} visible={false}>
        {[0, 1, 2].map((i) => (
          <Orb
            key={i}
            position={[-i * 0.38, i * 0.12, 0]}
            scale={[0.4 - i * 0.06, 0.27 - i * 0.03, 0.23]}
            color="#fffdf4"
          />
        ))}
      </group>
      <TouchArea radius={0.9} />
    </group>
  );
}

function FriendlyButterfly() {
  const body = useRef<Group>(null),
    left = useRef<Group>(null),
    right = useRef<Group>(null);
  const follow = useRef(new Vector3());
  const touch = useTouch("butterfly");
  useFrame(() => {
    if (!body.current) return;
    const { wonders, reduced, game } = useGame.getState();
    const t = wonderTime.butterfly;
    const amount = wonders.butterfly
      ? wonderEnvelope(t, wonderDuration.butterfly, reduced)
      : 0;
    heroPosition(follow.current, game, movementProgress.current);
    follow.current.set(
      follow.current.x + 0.7,
      follow.current.y + 1.15,
      follow.current.z + 0.15,
    );
    const [x, y, z] = wonderHomes.butterfly;
    body.current.position.set(x, y, z).lerp(follow.current, amount);
    if (!reduced && wonders.butterfly) {
      body.current.position.x += Math.sin(t * 2) * 0.22 * amount;
      body.current.position.y += Math.sin(t * 3) * 0.12 * amount;
    }
    const flap =
      wonders.butterfly && !reduced ? 0.35 + Math.sin(t * 14) * 0.55 : 0.2;
    if (left.current) left.current.rotation.y = flap;
    if (right.current) right.current.rotation.y = -flap;
  });
  return (
    <>
      <group
        position={[wonderHomes.butterfly[0], 0.3, wonderHomes.butterfly[2]]}
      >
        <Orb scale={[0.38, 0.1, 0.23]} color="#82aa72" />
        <mesh position={[0, 0.27, 0]}>
          <cylinderGeometry args={[0.025, 0.04, 0.54, 6]} />
          <meshStandardMaterial color="#759360" />
        </mesh>
      </group>
      <group
        ref={body}
        position={wonderHomes.butterfly}
        name="wonder-butterfly"
        {...touch}
      >
        <group rotation={[0, 0.45, 0.1]} scale={1.4}>
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={side === -1 ? left : right}>
              <Orb
                position={[side * 0.18, 0.13, 0]}
                scale={[0.2, 0.23, 0.055]}
                color="#eeb580"
              />
              <Orb
                position={[side * 0.14, -0.13, 0]}
                scale={[0.14, 0.15, 0.05]}
                color="#a0c8b5"
              />
              <Orb
                position={[side * 0.2, 0.16, 0.051]}
                scale={[0.048, 0.064, 0.014]}
                color="#fff3ce"
              />
            </group>
          ))}
          <Orb scale={[0.035, 0.22, 0.055]} color="#6e7957" />
          <Orb
            position={[0, 0.23, 0]}
            scale={[0.065, 0.065, 0.06]}
            color="#6e7957"
          />
        </group>
        <TouchArea radius={0.7} />
      </group>
    </>
  );
}
export default function TinyWonders({ flower }: { flower: string }) {
  return (
    <group name="tiny-wonders">
      <SleepyFlower color={flower} />
      <TickleCloud />
      <FriendlyButterfly />
    </group>
  );
}
