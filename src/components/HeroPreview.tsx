"use client";
import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { Character } from "./game/Hero";
import { SceneBoundary } from "./Scene";
import type { Gift } from "@/domain/config";
import type { HeroMotion } from "@/domain/hero-motion";
export default function HeroPreview({
  gift,
  onReady,
  onFailure,
  previewMotion,
}: {
  gift: Gift;
  onReady: () => void;
  onFailure: () => void;
  previewMotion?: { name: HeroMotion; request: number };
}) {
  useEffect(() => {
    if (!gift.modelUrl) onReady();
  }, [gift.modelUrl, onReady]);
  return (
    <SceneBoundary onFailure={onFailure}>
      <Suspense
        fallback={
          <div className="scene-loading">Loading the stored model…</div>
        }
      >
        <Canvas camera={{ position: [0, 1.8, 4.3], fov: 35 }} dpr={[1, 1.5]}>
          <ambientLight intensity={2} />
          <directionalLight position={[3, 5, 5]} intensity={2} />
          <Character
            gift={gift}
            showcase
            previewMotion={previewMotion}
            onReady={onReady}
          />
          <OrbitControls
            target={[0, 0.9, 0]}
            enablePan={false}
            minDistance={2.5}
            maxDistance={6}
          />
          <ContactShadows
            position={[0, -0.03, 0]}
            opacity={0.2}
            scale={6}
            blur={3}
            far={4}
            frames={1}
          />
        </Canvas>
      </Suspense>
    </SceneBoundary>
  );
}
