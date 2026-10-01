"use client";
import { useEffect, useReducer, useRef } from "react";
import { DRAWING_LIFT_MS, WORLD_ENTRANCE_MS, reveal } from "@/domain/reveal";

export function useGiftReveal(paused: boolean, reduced: boolean) {
  const [phase, send] = useReducer(reveal, "sealed");
  const progress = useRef(0);
  const elapsed = useRef(0);
  useEffect(() => {
    elapsed.current = 0;
    progress.current = phase === "playing" ? 1 : 0;
  }, [phase]);
  useEffect(() => {
    if (paused || (phase !== "drawing" && phase !== "entering")) return;
    if (reduced) {
      send({ type: phase === "drawing" ? "drawing-ready" : "arrive" });
      return;
    }
    let frame = 0;
    let last = performance.now();
    const duration = phase === "drawing" ? DRAWING_LIFT_MS : WORLD_ENTRANCE_MS;
    const tick = (now: number) => {
      // Returning to a backgrounded tab must not skip the whole introduction.
      if (!document.hidden) elapsed.current += Math.min(now - last, 100);
      last = now;
      progress.current = Math.min(elapsed.current / duration, 1);
      if (progress.current === 1)
        send({ type: phase === "drawing" ? "drawing-ready" : "arrive" });
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, paused, reduced]);
  return { phase, send, progress };
}
