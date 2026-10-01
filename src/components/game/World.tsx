"use client";
import { useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Character, Orb, Star } from "./Hero";
import { useGame } from "./store";
import { palettes, type Gift } from "@/domain/config";
import { type Destination, type Action, waypoints } from "@/domain/quest";
import CameraRig, { type RevealView } from "./CameraRig";
import { islandProgress } from "@/domain/celebration";
import { wonderIds } from "@/domain/wonders";
import TinyWonders from "./TinyWonders";
import {
  CelebrationSun,
  GardenFlower,
  IslandGlow,
  ProgressRibbon,
} from "./IslandCelebration";
function Flower({
  x,
  z,
  c = "#f5c56c",
  s = 1,
}: {
  x: number;
  z: number;
  c?: string;
  s?: number;
}) {
  return (
    <group position={[x, 0.2, z]} scale={s}>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.6, 6]} />
        <meshStandardMaterial color="#648d68" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <Orb
          key={i}
          position={[
            Math.cos(i * 1.257) * 0.2,
            0.62 + Math.sin(i * 1.257) * 0.2,
            0,
          ]}
          scale={[0.14, 0.14, 0.07]}
          color={c}
        />
      ))}
      <Orb
        position={[0, 0.62, 0.07]}
        scale={[0.12, 0.12, 0.08]}
        color="#fff4cb"
      />
      <Orb
        position={[0.15, 0.2, 0]}
        scale={[0.18, 0.065, 0.07]}
        color="#86ad75"
      />
    </group>
  );
}
function Cloud({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {[-1, 0, 1].map((n) => (
        <Orb
          key={n}
          position={[n * 0.55, n === 0 ? 0.12 : 0, 0]}
          scale={[0.58, n === 0 ? 0.43 : 0.28, 0.32]}
          color="#fffaf0"
        />
      ))}
    </group>
  );
}
function RenderMetrics({ mini }: { mini: boolean }) {
  const frames = useRef<number[]>([]);
  const sampleKey = useRef("");
  const { gl } = useThree();
  useFrame((_, delta) => {
    const { game, low, wonders } = useGame.getState();
    const stage = mini ? "miniature" : game.stage;
    const activeWonders = mini ? [] : wonderIds.filter((id) => wonders[id]);
    const key = `${stage}:${low}:${activeWonders.join(",")}`;
    if (key !== sampleKey.current) {
      sampleKey.current = key;
      frames.current = [];
      delete gl.domElement.dataset.measurement;
    }
    if (frames.current.length < 120) frames.current.push(delta * 1000);
    else if (!gl.domElement.dataset.measurement) {
      const sorted = [...frames.current].sort((a, b) => a - b);
      gl.domElement.dataset.measurement = JSON.stringify({
        frames: 120,
        stage,
        low,
        medianFrameMs: Math.round(sorted[60] * 100) / 100,
        triangles: gl.info.render.triangles,
        drawCalls: gl.info.render.calls,
        dpr: gl.getPixelRatio(),
        wonders: activeWonders,
      });
    }
    gl.domElement.dataset.ready = "true";
  });
  return null;
}
function WebGLFallback({ onFailure }: { onFailure?: () => void }) {
  return (
    <div className="scene-loading">
      3D isn’t available in this browser. Your note is safe; use the story
      controls to finish the adventure.
    </div>
  );
}
function Diorama({
  gift,
  mini = false,
  onAction,
  reveal,
  onReady,
}: {
  gift: Gift;
  mini?: boolean;
  onAction?: (a: Action) => void;
  reveal?: RevealView;
  onReady?: () => void;
}) {
  const questStage = useGame((s) => s.game.stage);
  const bellIndex = useGame((s) => s.game.bellIndex);
  const stage = mini ? "intro" : questStage;
  const progress = islandProgress({ stage, bellIndex });
  const low = useGame((s) => s.low);
  const storeDispatch = useGame((s) => s.dispatch);
  const dispatch = onAction || storeDispatch;
  const colors = palettes[gift.config.palette];
  const closeup = reveal?.phase === "drawing" || reveal?.phase === "hero";
  const go = (to: Destination) => {
    if (!mini) dispatch({ type: "go", to });
  };
  return (
    <>
      <ambientLight intensity={1.7} />
      <CelebrationSun delivered={progress.delivered} low={low} />
      <CameraRig mini={mini} reveal={reveal} />
      <group visible={!closeup}>
        <group position={[0, -0.35, 0]}>
          <mesh receiveShadow>
            <cylinderGeometry args={[5.3, 4.35, 1, 64]} />
            <meshStandardMaterial color="#d7b89a" />
          </mesh>
          <mesh position={[0, -0.9, 0]} rotation={[0, 0.2, 0]}>
            <cylinderGeometry args={[4.4, 2.4, 1.15, 10]} />
            <meshStandardMaterial color="#e3cbb0" />
          </mesh>
        </group>
        <IslandGlow delivered={progress.delivered} grass={colors.grass} />
        <ProgressRibbon lights={progress.ribbonLights} />
        <group position={[-4.35, 0.22, -0.1]} rotation={[0, 0.12, 0]}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.07, 0.6, 0.08]} />
            <meshStandardMaterial color="#b38c6c" />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <boxGeometry args={[1.05, 0.4, 0.07]} />
            <meshStandardMaterial color="#f6e5ba" />
          </mesh>
          <mesh position={[-0.3, 0.72, 0.045]}>
            <circleGeometry args={[0.08, 18]} />
            <meshBasicMaterial color="#668a77" />
          </mesh>
          <mesh position={[0, 0.72, 0.045]} rotation={[0, 0, Math.PI / 2]}>
            <circleGeometry args={[0.09, 3]} />
            <meshBasicMaterial color="#c68a70" />
          </mesh>
          <Star position={[0.3, 0.72, 0.05]} size={0.085} />
        </group>
        <group position={[-2.9, 0.22, -0.2]} onClick={() => go("bells")}>
          <mesh position={[-0.95, 1, 0]} castShadow>
            <capsuleGeometry args={[0.11, 1.8, 4, 8]} />
            <meshStandardMaterial color="#d5a17c" />
          </mesh>
          <mesh position={[0.95, 1, 0]} castShadow>
            <capsuleGeometry args={[0.11, 1.8, 4, 8]} />
            <meshStandardMaterial color="#d5a17c" />
          </mesh>
          <mesh position={[0, 2, 0]} castShadow>
            <boxGeometry args={[2.3, 0.18, 0.18]} />
            <meshStandardMaterial color="#d5a17c" />
          </mesh>
          {(["circle", "triangle", "star"] as const).map((b, i) => (
            <group
              key={b}
              position={[(i - 1) * 0.63, 1.5, 0]}
              onClick={(e) => {
                e.stopPropagation();
                if (!mini) {
                  go("bells");
                  dispatch({ type: "bell", bell: b });
                }
              }}
            >
              <mesh castShadow>
                <cylinderGeometry args={[0.14, 0.24, 0.36, 20]} />
                <meshStandardMaterial
                  color={["#8cbaac", "#e9a089", "#e8c46e"][i]}
                />
              </mesh>
              <Orb
                position={[0, -0.22, 0]}
                scale={[0.05, 0.05, 0.05]}
                color="#865f43"
              />
              {i === 0 ? (
                <mesh position={[0, 0.03, 0.2]}>
                  <circleGeometry args={[0.08, 16]} />
                  <meshBasicMaterial color="#fff5db" />
                </mesh>
              ) : i === 1 ? (
                <mesh position={[0, 0.02, 0.22]}>
                  <circleGeometry args={[0.11, 3]} />
                  <meshBasicMaterial color="#fff5db" />
                </mesh>
              ) : (
                <Star position={[0, 0.02, 0.23]} size={0.11} />
              )}
            </group>
          ))}
          <group
            position={[-0.95, 0.45, 0.08]}
            rotation={[
              0,
              0,
              stage === "bell_gate" || stage === "intro" ? 0 : -1.4,
            ]}
          >
            <mesh position={[0.95, 0, 0]}>
              <boxGeometry args={[1.85, 0.18, 0.12]} />
              <meshStandardMaterial color="#f6e4bd" />
            </mesh>
          </group>
        </group>
        <group
          position={[0.1, 0.23, -2.6]}
          onClick={() => {
            if (mini) return;
            if (useGame.getState().game.location === "garden")
              dispatch({ type: "interact" });
            else go("garden");
          }}
        >
          <mesh>
            <cylinderGeometry args={[1.05, 1.2, 0.13, 32]} />
            <meshStandardMaterial color="#90b993" />
          </mesh>
          {stage !== "gift_delivery" && stage !== "complete" && (
            <Star position={[0, 0.95, 0]} size={0.55} />
          )}{" "}
          {[0, 1, 2, 3, 4].map((i) => (
            <GardenFlower
              key={i}
              x={Math.cos(i * 1.3) * 0.9}
              z={Math.sin(i * 1.3) * 0.7}
              color={colors.flower}
              bloom={progress.gardenBloom}
              index={i}
            />
          ))}
        </group>
        <group
          position={[3.6, 0.2, 0.9]}
          onClick={() => {
            if (mini) return;
            if (useGame.getState().game.location === "mailbox")
              dispatch({ type: "interact" });
            else go("mailbox");
          }}
        >
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.17, 1, 0.18]} />
            <meshStandardMaterial color="#ad8062" />
          </mesh>
          <mesh position={[0, 1.23, 0]} castShadow>
            <boxGeometry args={[0.85, 0.65, 0.65]} />
            <meshStandardMaterial color="#d88d75" />
          </mesh>
          <mesh position={[0, 1.52, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry
              args={[0.43, 0.43, 0.65, 24, 1, false, 0, Math.PI]}
            />
            <meshStandardMaterial color="#d88d75" />
          </mesh>
          <mesh
            position={[0, 1.24, 0.34]}
            rotation={[stage === "complete" ? -1.3 : 0, 0, 0]}
          >
            <boxGeometry args={[0.73, 0.5, 0.05]} />
            <meshStandardMaterial color="#f2bda4" />
          </mesh>
          <Star position={[0, 1.27, 0.39]} size={0.14} />
          <mesh position={[0.5, 1.45, 0]}>
            <boxGeometry args={[0.05, 0.48, 0.06]} />
            <meshStandardMaterial color="#577d6e" />
          </mesh>
          <mesh position={[0.63, 1.65, 0]}>
            <boxGeometry args={[0.3, 0.2, 0.05]} />
            <meshStandardMaterial color="#f3d175" />
          </mesh>
        </group>
        {[
          [-4, -1.7, 1.3],
          [-3.5, -2.8, 1.1],
          [2.8, -2.4, 1.5],
          [4, -0.9, 0.9],
          ...(mini ? [[-1.2, 3.7, 0.75]] : []),
          [2.2, 3.3, 1],
        ].map(([x, z, s], i) => (
          <Flower
            key={i}
            x={x}
            z={z}
            s={s}
            c={i % 2 ? "#f0a893" : colors.flower}
          />
        ))}
        {[
          [-4.2, 1.1],
          [-0.9, -3.7],
          [1.8, -3.7],
          [3.8, 2.6],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.2, z]}>
            <Orb
              position={[0, 0.27, 0]}
              scale={[0.45, 0.33, 0.4]}
              color="#92b38b"
            />
            <Orb
              position={[0.3, 0.17, 0.15]}
              scale={[0.3, 0.22, 0.3]}
              color="#a4c295"
            />
          </group>
        ))}
        <Cloud position={[-6, 1, -2]} scale={1.1} />
        <Cloud position={[4, 2.2, -4]} scale={1.3} />
        {mini && <Cloud position={[-3, -1.4, 5]} scale={0.65} />}
        <Cloud position={[6, -0.8, 3]} scale={0.8} />
        {!mini && <TinyWonders flower={colors.flower} />}
        {!mini &&
          stage !== "intro" &&
          stage !== "complete" &&
          (["bells", "garden", "mailbox"] as Destination[]).map((to) => (
            <mesh
              key={to}
              position={[waypoints[to][0], 0.57, waypoints[to][2]]}
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={() => go(to)}
            >
              <ringGeometry args={[0.31, 0.38, 28]} />
              <meshBasicMaterial color="#fff9db" transparent opacity={0.8} />
            </mesh>
          ))}
        {!low && (
          <ContactShadows
            position={[0, -2.4, 0]}
            scale={20}
            opacity={0.18}
            blur={3}
            far={7}
            resolution={256}
            frames={1}
          />
        )}
      </group>
      <group visible={reveal?.phase !== "drawing"}>
        <Character gift={gift} onReady={onReady} />
      </group>
      {closeup && (
        <mesh
          position={[waypoints.start[0], 0.21, waypoints.start[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[0.6, 0.35, 1]}
        >
          <circleGeometry args={[1, 40]} />
          <meshBasicMaterial
            color="#a6b99c"
            transparent
            opacity={0.16}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
export default function World({
  gift,
  mini = false,
  onFailure,
  onAction,
  reveal,
  onReady,
}: {
  gift: Gift;
  mini?: boolean;
  onFailure?: () => void;
  onAction?: (a: Action) => void;
  reveal?: RevealView;
  onReady?: () => void;
}) {
  const low = useGame((s) => s.low);
  return (
    <Canvas
      fallback={<WebGLFallback onFailure={onFailure} />}
      orthographic
      shadows={low ? false : "percentage"}
      dpr={low ? 1 : [1, 1.5]}
      camera={{ position: [10, 10, 14], near: 0.1, far: 100, zoom: 45 }}
      gl={{ antialias: !low, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener(
          "webglcontextlost",
          onFailure ?? (() => {}),
        );
      }}
    >
      <Diorama
        gift={gift}
        mini={mini}
        onAction={onAction}
        reveal={reveal}
        onReady={onReady}
      />
      <RenderMetrics mini={mini} />
      {mini && (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={0.6}
          maxPolarAngle={1.1}
          minAzimuthAngle={-0.6}
          maxAzimuthAngle={1.2}
        />
      )}
    </Canvas>
  );
}
