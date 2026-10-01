"use client";
import dynamic from "next/dynamic";
import { Component, Suspense, type ReactNode } from "react";
import type { Gift } from "@/domain/config";
import type { Action } from "@/domain/quest";
import type { RevealView } from "./game/CameraRig";
const World = dynamic(() => import("./game/World"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading">Unfolding your little world…</div>
  ),
});
export class SceneBoundary extends Component<
  { children: ReactNode; onFailure?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure?.();
  }
  render() {
    return this.state.failed ? (
      <div className="scene-loading" role="status">
        The 3D scene couldn’t load. Your gift is safe. Use the story controls
        below, or reload to try the model again. No generation was started.
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function Scene({
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
  onAction?: (action: Action) => void;
  reveal?: RevealView;
  onReady?: () => void;
}) {
  return (
    <SceneBoundary onFailure={onFailure}>
      <Suspense
        fallback={<div className="scene-loading">Opening the character…</div>}
      >
        <World
          gift={gift}
          mini={mini}
          onFailure={onFailure}
          onAction={onAction}
          reveal={reveal}
          onReady={onReady}
        />
      </Suspense>
    </SceneBoundary>
  );
}
