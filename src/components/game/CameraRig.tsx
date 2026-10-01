"use client";
import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { entranceEase, type RevealPhase } from "@/domain/reveal";
import { waypoints } from "@/domain/quest";

export type RevealView = {
  phase: RevealPhase;
  progress: RefObject<number>;
  withDrawing: boolean;
};

export default function CameraRig({
  mini,
  reveal,
}: {
  mini: boolean;
  reveal?: RevealView;
}) {
  const lastPhase = useRef<RevealPhase | undefined>(undefined);
  const lastSize = useRef("");
  const look = useRef(new Vector3());
  const entrance = useRef({
    position: new Vector3(),
    look: new Vector3(),
    zoom: 1,
  });
  const target = useRef(new Vector3());
  const position = useRef(new Vector3());
  // Read the renderer's current size here, not a React render's captured size.
  // ResizeObserver can update the frustum before React commits a new callback.
  useFrame(({ camera, size }) => {
    const phase = reveal?.phase;
    const sizeKey = `${size.width}/${size.height}`;
    const changed = phase !== lastPhase.current || sizeKey !== lastSize.current;
    // The landing miniature keeps its own user-controlled orbit.
    if (mini && !changed) return;
    const gameZoom = Math.min(size.width / 14, size.height / 10);
    if (phase === "entering") {
      if (lastPhase.current !== "entering") {
        entrance.current.position.copy(camera.position);
        entrance.current.look.copy(look.current);
        entrance.current.zoom = camera.zoom;
      }
      const p = entranceEase(reveal!.progress.current);
      camera.position.lerpVectors(
        entrance.current.position,
        position.current.set(10, 10, 14),
        p,
      );
      look.current.lerpVectors(
        entrance.current.look,
        target.current.set(0, 0, 0),
        p,
      );
      camera.zoom =
        entrance.current.zoom + (gameZoom - entrance.current.zoom) * p;
    } else if (phase === "drawing" || phase === "hero") {
      const portrait = size.width < 700;
      const zoom = Math.min(
        size.width / (reveal?.withDrawing ? (portrait ? 3.2 : 5.2) : 3.5),
        size.height / 2.8,
      );
      const offset = reveal?.withDrawing ? (-0.22 * size.width) / zoom : 0;
      target.current.set(waypoints.start[0] + offset, 0.98, waypoints.start[2]);
      camera.position.copy(target.current).add(position.current.set(0, 1.1, 7));
      look.current.copy(target.current);
      camera.zoom = zoom;
    } else if (changed) {
      camera.position.set(10, 10, 14);
      look.current.set(0, 0, 0);
      camera.zoom = gameZoom;
    } else return;
    camera.lookAt(look.current);
    camera.updateProjectionMatrix();
    lastPhase.current = phase;
    lastSize.current = sizeKey;
  });
  return null;
}
