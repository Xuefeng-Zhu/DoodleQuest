"use client";
import { create } from "zustand";
import { initialQuest, quest, type Action, type Quest } from "@/domain/quest";
type State = {
  game: Quest;
  low: boolean;
  muted: boolean;
  reduced: boolean;
  dispatch: (a: Action) => void;
  settings: (s: Partial<Pick<State, "low" | "muted" | "reduced">>) => void;
};
export const useGame = create<State>((set) => ({
  game: initialQuest(),
  low: false,
  muted: true,
  reduced: false,
  dispatch: (a) => set((s) => ({ game: quest(s.game, a) })),
  settings: (s) => set(s),
}));
export const movementProgress = { current: 0 };
