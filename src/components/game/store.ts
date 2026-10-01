"use client";
import { create } from "zustand";
import { initialQuest, quest, type Action, type Quest } from "@/domain/quest";
import {
  discover,
  settle,
  initialWonders,
  type Wonder,
  type Wonders,
} from "@/domain/wonders";
export const wonderTime: Record<Wonder, number> = {
  flower: 0,
  cloud: 0,
  butterfly: 0,
};
function clearWonderTime() {
  wonderTime.flower = wonderTime.cloud = wonderTime.butterfly = 0;
}
type State = {
  game: Quest;
  wonders: Wonders;
  discover: (id: Wonder) => void;
  settle: (id: Wonder) => void;
  resetWonders: () => void;
  low: boolean;
  muted: boolean;
  reduced: boolean;
  dispatch: (a: Action) => void;
  settings: (s: Partial<Pick<State, "low" | "muted" | "reduced">>) => void;
};
export const useGame = create<State>((set) => ({
  game: initialQuest(),
  wonders: initialWonders(),
  low: false,
  muted: true,
  reduced: false,
  dispatch: (a) =>
    set((s) => {
      const game = quest(s.game, a);
      if (
        a.type === "replay" ||
        (game.stage === "complete" && s.game.stage !== "complete")
      ) {
        clearWonderTime();
        return { game, wonders: initialWonders() };
      }
      return { game };
    }),
  discover: (id) =>
    set((s) => {
      const wonders = discover(s.wonders, id, s.game);
      if (wonders === s.wonders) return s;
      wonderTime[id] = 0;
      return { wonders };
    }),
  settle: (id) => set((s) => ({ wonders: settle(s.wonders, id) })),
  resetWonders: () => {
    clearWonderTime();
    set({ wonders: initialWonders() });
  },
  settings: (s) => set(s),
}));
export const movementProgress = { current: 0 };
