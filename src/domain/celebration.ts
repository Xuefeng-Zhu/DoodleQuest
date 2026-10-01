import type { Quest } from "./quest";

// Presentation only. The quest is the sole authority for earning each milestone.
export function islandProgress(game: Pick<Quest, "stage" | "bellIndex">) {
  const solved = ["star_garden", "gift_delivery", "complete"].includes(
    game.stage,
  );
  return {
    ribbonLights:
      game.stage === "intro"
        ? 0
        : solved
          ? 3
          : Math.max(0, Math.min(3, game.bellIndex)),
    gardenBloom: game.stage === "gift_delivery" || game.stage === "complete",
    delivered: game.stage === "complete",
  };
}

// Bounded, one-shot transitions. No accumulating timers or new React state per frame.
// Reset immediately on replay/wrong bell; reduced motion shows the earned final state.
export function advanceCelebration(
  current: number,
  active: boolean,
  delta: number,
  options: { paused: boolean; reduced: boolean; duration: number },
) {
  if (!active) return 0;
  if (options.reduced) return 1;
  if (options.paused) return current;
  return Math.min(
    1,
    current + Math.min(0.1, Math.max(0, delta)) / options.duration,
  );
}

export function celebrationEase(progress: number) {
  return progress * progress * (3 - 2 * progress);
}
