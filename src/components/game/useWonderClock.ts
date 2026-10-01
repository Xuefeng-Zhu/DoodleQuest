"use client";
import { useEffect } from "react";
import { advanceWonder, wonderDuration, wonderIds } from "@/domain/wonders";
import { useGame, wonderTime } from "./store";

// The DOM owns effect lifetimes, so even the text-only gift can settle and replay.
// Renderers only read these refs. Store writes occur at activation/end, not every frame.
export function useWonderClock() {
  const running = useGame((s) => wonderIds.some((id) => s.wonders[id]));
  useEffect(() => {
    if (!running) return;
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const state = useGame.getState();
      for (const id of wonderIds) {
        if (!state.wonders[id]) continue;
        wonderTime[id] = advanceWonder(
          wonderTime[id],
          (now - last) / 1000,
          state.game.paused || document.hidden,
          wonderDuration[id],
        );
        if (wonderTime[id] >= wonderDuration[id]) state.settle(id);
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  useEffect(() => () => useGame.getState().resetWonders(), []);
}
