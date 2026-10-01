import { describe, expect, it } from "vitest";
import {
  advanceCelebration,
  celebrationEase,
  islandProgress,
} from "../src/domain/celebration";
import {
  initialQuest,
  quest,
  sequence,
  type Destination,
  type Quest,
} from "../src/domain/quest";

function go(game: Quest, to: Destination) {
  return quest(quest(game, { type: "go", to }), { type: "tick", delta: 2.4 });
}
function gate() {
  let game = go(quest(initialQuest(), { type: "open" }), "bells");
  for (const bell of sequence) game = quest(game, { type: "bell", bell });
  return game;
}
describe("island celebrations follow earned quest milestones", () => {
  it("lights only the correct bell prefix and resets on a wrong bell", () => {
    let game = go(quest(initialQuest(), { type: "open" }), "bells");
    expect(islandProgress(game).ribbonLights).toBe(0);
    game = quest(game, { type: "bell", bell: "circle" });
    expect(islandProgress(game).ribbonLights).toBe(1);
    game = quest(game, { type: "bell", bell: "triangle" });
    expect(islandProgress(game).ribbonLights).toBe(2);
    game = quest(game, { type: "bell", bell: "circle" });
    expect(islandProgress(game).ribbonLights).toBe(0);
    for (const bell of sequence) game = quest(game, { type: "bell", bell });
    expect(islandProgress(game)).toEqual({
      ribbonLights: 3,
      gardenBloom: false,
      delivered: false,
    });
  });
  it("does not bloom before collection, keeps flowers open after delivery and ignores duplicates", () => {
    let game = go(gate(), "mailbox");
    game = quest(game, { type: "interact" });
    expect(islandProgress(game).delivered).toBe(false);
    game = quest(game, { type: "go", to: "garden" });
    expect(islandProgress(quest(game, { type: "interact" })).gardenBloom).toBe(
      false,
    );
    game = quest(quest(game, { type: "tick", delta: 2.4 }), {
      type: "interact",
    });
    expect(islandProgress(game)).toEqual({
      ribbonLights: 3,
      gardenBloom: true,
      delivered: false,
    });
    expect(islandProgress(quest(game, { type: "interact" }))).toEqual(
      islandProgress(game),
    );
    game = quest(go(game, "mailbox"), { type: "interact" });
    expect(game.hasStar).toBe(false);
    expect(quest(game, { type: "interact" })).toEqual(game);
    expect(islandProgress(game)).toEqual({
      ribbonLights: 3,
      gardenBloom: true,
      delivered: true,
    });
    expect(islandProgress(quest(game, { type: "interact" }))).toEqual(
      islandProgress(game),
    );
    expect(islandProgress(quest(game, { type: "replay" }))).toEqual(
      islandProgress(initialQuest()),
    );
  });
  it("does not earn celebrations through unavailable or paused actions", () => {
    let game = quest(initialQuest(), { type: "open" });
    expect(
      islandProgress(quest(game, { type: "bell", bell: "circle" }))
        .ribbonLights,
    ).toBe(0);
    game = quest(go(game, "bells"), { type: "pause" });
    expect(
      islandProgress(quest(game, { type: "bell", bell: "circle" })),
    ).toEqual(islandProgress(initialQuest()));
  });
});
describe("bounded celebration motion", () => {
  const options = { paused: false, reduced: false, duration: 1 };
  it("settles once, caps long frames and never reverses on negative deltas", () => {
    expect(advanceCelebration(0, true, 10, options)).toBe(0.1);
    expect(advanceCelebration(0.5, true, -1, options)).toBe(0.5);
    expect(advanceCelebration(0.99, true, 0.1, options)).toBe(1);
    expect(advanceCelebration(1, true, 0.1, options)).toBe(1);
    expect(celebrationEase(0)).toBe(0);
    expect(celebrationEase(0.5)).toBe(0.5);
    expect(celebrationEase(1)).toBe(1);
  });
  it("freezes while paused; reduced motion immediately shows the earned state", () => {
    expect(
      advanceCelebration(0.4, true, 0.1, { ...options, paused: true }),
    ).toBe(0.4);
    expect(
      advanceCelebration(0, true, 0.1, { ...options, reduced: true }),
    ).toBe(1);
    expect(
      advanceCelebration(0.4, true, 0.1, {
        ...options,
        paused: true,
        reduced: true,
      }),
    ).toBe(1);
  });
  it("resets immediately on replay or wrong bell, even while paused", () => {
    expect(
      advanceCelebration(1, false, 0.1, { ...options, paused: true }),
    ).toBe(0);
    expect(
      advanceCelebration(0.4, false, 0.1, { ...options, reduced: true }),
    ).toBe(0);
  });
});
