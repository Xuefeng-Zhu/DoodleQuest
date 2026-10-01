import { beforeEach, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { initialQuest, quest, sequence, waypoints } from "../src/domain/quest";
import {
  advanceWonder,
  discover,
  heroPosition,
  initialWonders,
  settle,
  wonderDuration,
  wonderEnvelope,
  wonderIds,
} from "../src/domain/wonders";
import { useGame, wonderTime } from "../src/components/game/store";

beforeEach(() => useGame.getState().dispatch({ type: "replay" }));
describe("optional little wonders", () => {
  it("blocks discovery before opening, during pause, and after completion", () => {
    const wonders = initialWonders();
    for (const game of [
      initialQuest(),
      { ...initialQuest(), stage: "bell_gate" as const, paused: true },
      { ...initialQuest(), stage: "complete" as const },
    ])
      for (const id of wonderIds)
        expect(discover(wonders, id, game)).toBe(wonders);
  });
  it("allows independent discoveries without collecting or advancing anything", () => {
    const game = quest(initialQuest(), { type: "open" });
    useGame.setState({ game });
    for (const id of wonderIds) useGame.getState().discover(id);
    expect(useGame.getState().game).toBe(game);
    expect(useGame.getState().wonders).toEqual({
      flower: true,
      cloud: true,
      butterfly: true,
      latest: "butterfly",
    });
    expect(useGame.getState().game).toMatchObject({
      stage: "bell_gate",
      hasStar: false,
      bellIndex: 0,
      target: null,
    });
  });
  it("ignores repeated taps rather than stacking effects or extending a lifetime", () => {
    const s = useGame.getState();
    s.dispatch({ type: "open" });
    s.discover("cloud");
    wonderTime.cloud = 1.5;
    const active = useGame.getState().wonders;
    for (let i = 0; i < 50; i++) s.discover("cloud");
    expect(useGame.getState().wonders).toBe(active);
    expect(wonderTime.cloud).toBe(1.5);
    s.settle("cloud");
    s.discover("cloud");
    expect(wonderTime.cloud).toBe(0);
    expect(useGame.getState().wonders.cloud).toBe(true);
  });
  it("settles one wonder without cancelling another or erasing its announcement", () => {
    const active = {
      flower: true,
      cloud: true,
      butterfly: false,
      latest: "flower" as const,
    };
    expect(settle(active, "cloud")).toEqual({ ...active, cloud: false });
    expect(settle(active, "butterfly")).toBe(active);
    expect(settle(active, "flower")).toMatchObject({
      flower: false,
      cloud: true,
      latest: null,
    });
  });
  it("resets every effect and elapsed ref on replay, cleanup and actual delivery", () => {
    const s = useGame.getState();
    const activate = () => {
      for (const id of wonderIds) {
        s.discover(id);
        wonderTime[id] = 0.8;
      }
    };
    s.dispatch({ type: "open" });
    activate();
    s.dispatch({ type: "replay" });
    expect(useGame.getState().wonders).toEqual(initialWonders());
    expect(wonderTime).toEqual({ flower: 0, cloud: 0, butterfly: 0 });
    s.dispatch({ type: "open" });
    activate();
    s.resetWonders();
    expect(useGame.getState().wonders).toEqual(initialWonders());
    expect(useGame.getState().game.stage).toBe("bell_gate");
    s.dispatch({ type: "go", to: "bells" });
    s.dispatch({ type: "tick", delta: 2.4 });
    for (const bell of sequence) s.dispatch({ type: "bell", bell });
    s.dispatch({ type: "go", to: "garden" });
    s.dispatch({ type: "tick", delta: 2.4 });
    s.dispatch({ type: "interact" });
    s.dispatch({ type: "go", to: "mailbox" });
    s.dispatch({ type: "tick", delta: 2.4 });
    activate();
    s.dispatch({ type: "interact" });
    expect(useGame.getState().game.stage).toBe("complete");
    expect(useGame.getState().wonders).toEqual(initialWonders());
    expect(wonderTime).toEqual({ flower: 0, cloud: 0, butterfly: 0 });
  });
  it("pauses lifetime, caps long/invalid frame deltas and finishes once", () => {
    expect(advanceWonder(1, 10, true, 6)).toBe(1);
    expect(advanceWonder(1, 10, false, 6)).toBe(1.1);
    expect(advanceWonder(1, -1, false, 6)).toBe(1);
    expect(advanceWonder(1, NaN, false, 6)).toBe(1);
    expect(advanceWonder(5.95, 0.1, false, 6)).toBe(6);
    expect(advanceWonder(6, 0.1, false, 6)).toBe(6);
  });
  it("normal motion blooms then settles; reduced motion is a static response", () => {
    for (const id of wonderIds) {
      const duration = wonderDuration[id];
      expect(wonderEnvelope(0, duration, false)).toBe(0);
      expect(wonderEnvelope(1, duration, false)).toBe(1);
      expect(wonderEnvelope(duration, duration, false)).toBe(0);
      expect(wonderEnvelope(0, duration, true)).toBe(1);
      expect(wonderEnvelope(duration - 0.1, duration, true)).toBe(1);
    }
  });
  it("samples the same authored hero path, including travel and arrival", () => {
    const out = new Vector3();
    const game = { location: "bells" as const, target: "garden" as const };
    heroPosition(out, game, 1.2);
    expect(out.x).toBeCloseTo((waypoints.bells[0] + waypoints.garden[0]) / 2);
    expect(out.y).toBe(0.22);
    expect(out.z).toBeCloseTo((waypoints.bells[2] + waypoints.garden[2]) / 2);
    heroPosition(out, game, 99);
    expect(out.x).toBeCloseTo(waypoints.garden[0]);
    expect(out.y).toBe(0.22);
    expect(out.z).toBeCloseTo(waypoints.garden[2]);
  });
});
