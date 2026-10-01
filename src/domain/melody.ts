import { sequence, type Action, type Bell, type Quest } from "./quest";

// An original, fixed C-major motif. No generated music or external samples.
export const bellPitches: Record<Bell, number> = {
  circle: 523.251,
  triangle: 659.255,
  star: 783.991,
};
export type SoundCue = Bell | "star-found" | "home";
export type ScoreNote = {
  pitch: number;
  at: number;
  length: number;
  level: number;
};
const tone = (
  pitch: number,
  at: number,
  length = 0.9,
  level = 1,
): ScoreNote => ({ pitch, at, length, level });
const motif = sequence.map((bell) => bellPitches[bell]);
export function scoreFor(cue: SoundCue): ScoreNote[] {
  if (cue === "home")
    return [
      tone(motif[0], 0),
      tone(motif[1], 0.48),
      tone(motif[2], 0.96, 1.25),
      tone(motif[1], 1.9, 0.8),
      tone(587.33, 2.35, 0.7),
      tone(motif[0], 2.8, 1.4),
      tone(motif[0] / 2, 2.8, 1.5, 0.55),
    ];
  if (cue === "star-found")
    return motif.map((pitch, i) => tone(pitch * 2, i * 0.16, 0.55, 0.45));
  return [tone(bellPitches[cue], 0, 0.85, 0.85)];
}
export function soundForAction(
  before: Quest,
  after: Quest,
  action: Action,
): SoundCue | null {
  if (before === after || before.paused || before.target) return null;
  // A wrong sequence still rings the chosen bell, but only at the bell station.
  if (
    action.type === "bell" &&
    before.stage === "bell_gate" &&
    before.location === "bells"
  )
    return action.bell;
  if (action.type === "interact" && !before.hasStar && after.hasStar)
    return "star-found";
  return null;
}
