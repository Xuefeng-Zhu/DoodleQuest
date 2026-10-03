import type { Quest } from "./quest";

export type HeroMotion = "idle" | "walk" | "celebrate";
export type HeroReaction = "gate" | "star" | "delivery";
export type HeroClips<T> = Partial<Record<HeroMotion, T>>;

/** Match supported motions, never guess that an arbitrary uploaded clip is a walk. */
export function resolveHeroClips<T extends { name: string }>(
  clips: readonly T[],
): HeroClips<T> {
  const result: HeroClips<T> = {};
  for (const clip of clips) {
    const name = clip.name.toLowerCase().replace(/\.\d+$/, "");
    const tail = name.split(/[:|/]/).at(-1)!.replace(/[_-]+/g, " ").trim();
    const motion: HeroMotion | undefined = /^(idle|standing idle)$/.test(tail)
      ? "idle"
      : /^(walk|walking|march)$/.test(tail)
        ? "walk"
        : /^(cheer|celebrate|celebration|victory celebration)$/.test(tail)
          ? "celebrate"
          : undefined;
    if (motion && !result[motion]) result[motion] = clip;
  }
  return result;
}

export function heroReaction(before: Quest, after: Quest): HeroReaction | null {
  if (before === after || before.paused || before.target) return null;
  if (
    before.stage === "bell_gate" &&
    after.stage === "star_garden" &&
    after.bellIndex === 3
  )
    return "gate";
  if (
    before.stage === "star_garden" &&
    !before.hasStar &&
    after.hasStar &&
    after.stage === "gift_delivery"
  )
    return "star";
  if (
    before.stage === "gift_delivery" &&
    before.hasStar &&
    after.stage === "complete"
  )
    return "delivery";
  return null;
}

export type HeroMotionState = {
  motion: HeroMotion;
  time: number;
  phaseTime: number;
  cheers: number;
  /** Distinguishes repeated one-shots and replay, even when the motion name is unchanged. */
  revision: number;
};
export const initialHeroMotion = (): HeroMotionState => ({
  motion: "idle",
  time: 0,
  phaseTime: 0,
  cheers: 0,
  revision: 0,
});

export function requestHeroMotion(
  state: HeroMotionState,
  motion: HeroMotion,
): HeroMotionState {
  return {
    ...state,
    motion,
    phaseTime: 0,
    revision: state.revision + 1,
    cheers: state.cheers + (motion === "celebrate" ? 1 : 0),
  };
}

/** Observe store transitions, so a render or repeated interaction cannot replay a cheer. */
export function observeHeroQuest(
  state: HeroMotionState,
  before: Quest,
  after: Quest,
  reduced: boolean,
): HeroMotionState {
  if (after.stage === "intro" && before.stage !== "intro")
    return { ...initialHeroMotion(), revision: state.revision + 1 };
  return !reduced && heroReaction(before, after)
    ? requestHeroMotion(state, "celebrate")
    : state;
}

export type HeroMotionFrame = {
  delta: number;
  moving: boolean;
  paused: boolean;
  hidden: boolean;
  reduced: boolean;
  celebrationDuration?: number;
};
export function heroMotionDelta({
  delta,
  paused,
  hidden,
  reduced,
}: HeroMotionFrame): number {
  return paused || hidden || reduced || !Number.isFinite(delta)
    ? 0
    : Math.min(0.1, Math.max(0, delta));
}
export function advanceHeroMotion(
  state: HeroMotionState,
  frame: HeroMotionFrame,
): HeroMotionState {
  // Reduced motion also cancels a pending reaction; disabling it later never replays it.
  if (frame.reduced)
    return state.motion === "idle" && state.phaseTime === 0
      ? state
      : {
          ...state,
          motion: "idle",
          phaseTime: 0,
          revision: state.revision + 1,
        };
  if (frame.paused || frame.hidden) return state;
  const delta = heroMotionDelta(frame);
  const duration = Math.max(0.1, frame.celebrationDuration ?? 2);
  // Navigation always wins. A cheer must never hold the hero at a station.
  const motion = frame.moving
    ? "walk"
    : state.motion === "celebrate" && state.phaseTime + delta < duration
      ? "celebrate"
      : "idle";
  const changed = motion !== state.motion;
  return {
    ...state,
    motion,
    time: state.time + delta,
    phaseTime: changed ? 0 : state.phaseTime + delta,
    revision: state.revision + (changed ? 1 : 0),
  };
}

/** Pip is an authored procedural example, independent of generated model rigging. */
export function pipPose(state: HeroMotionState, reduced: boolean) {
  const t = reduced ? 0 : state.phaseTime;
  const walk = !reduced && state.motion === "walk" ? Math.sin(t * 9) : 0;
  const cheer =
    !reduced && state.motion === "celebrate"
      ? Math.sin((Math.min(1, t / 0.2) * Math.PI) / 2) *
        Math.min(1, Math.max(0, (2 - t) / 0.3))
      : 0;
  return {
    foot: walk * 0.55,
    arm: walk * 0.42,
    armLift: cheer * 2.25,
    head: reduced
      ? 0
      : cheer * Math.sin(t * 10) * 0.12 + Math.sin(t * 1.8) * 0.035,
    height: cheer * Math.abs(Math.sin(t * 7)) * 0.15,
  };
}
