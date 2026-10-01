import type { Gift } from "./config";

// Presentation only: the quest remains at intro until this sequence finishes.
export type RevealPhase =
  "sealed" | "drawing" | "hero" | "entering" | "playing";
export type RevealAction =
  | { type: "open"; withDrawing: boolean; reduced: boolean }
  | { type: "drawing-ready" | "enter" | "arrive" | "skip" | "replay" };

export const DRAWING_LIFT_MS = 900;
export const WORLD_ENTRANCE_MS = 1800;

export function permittedDrawing(gift: Gift): string | undefined {
  return gift.config.showDrawing ? gift.drawingUrl : undefined;
}

export function reveal(phase: RevealPhase, action: RevealAction): RevealPhase {
  if (action.type === "replay") return "sealed";
  if (action.type === "open" && phase === "sealed")
    return action.withDrawing && !action.reduced ? "drawing" : "hero";
  if (action.type === "drawing-ready" && phase === "drawing") return "hero";
  if (action.type === "enter" && (phase === "drawing" || phase === "hero"))
    return "entering";
  if (action.type === "arrive" && phase === "entering") return "playing";
  if (action.type === "skip" && phase !== "sealed") return "playing";
  return phase;
}

export function entranceEase(progress: number) {
  const t = Math.max(0, Math.min(progress, 1));
  return t * t * (3 - 2 * t);
}
