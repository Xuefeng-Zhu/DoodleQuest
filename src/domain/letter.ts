export type LetterPhase = "sealed" | "opening" | "reading";
export type LetterAction =
  { type: "open"; reduced: boolean } | { type: "opened" | "fold" };
export const LETTER_OPEN_MS = 700;

// Presentation only: a letter is mounted after the quest is already complete.
export function letter(phase: LetterPhase, action: LetterAction): LetterPhase {
  if (action.type === "open" && phase === "sealed")
    return action.reduced ? "reading" : "opening";
  if (action.type === "opened" && phase === "opening") return "reading";
  if (action.type === "fold") return "sealed";
  return phase;
}

export function advanceLetter(
  elapsed: number,
  delta: number,
  paused: boolean,
  reduced: boolean,
) {
  if (reduced) return LETTER_OPEN_MS;
  if (paused) return elapsed;
  return Math.min(LETTER_OPEN_MS, elapsed + Math.min(100, Math.max(0, delta)));
}
