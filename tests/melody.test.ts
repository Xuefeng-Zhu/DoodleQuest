import { afterEach, describe, expect, it, vi } from "vitest";
import { initialQuest, quest, sequence, type Quest } from "../src/domain/quest";
import { bellPitches, scoreFor, soundForAction } from "../src/domain/melody";
import { MelodyPlayer } from "../src/components/game/MelodyPlayer";

class Param {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class Node {
  connect = vi.fn((node: unknown) => node);
  disconnect = vi.fn();
}
class Oscillator extends Node {
  frequency = new Param();
  type = "";
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
}
class Context {
  currentTime = 10;
  state = "running";
  destination = new Node();
  oscillators: Oscillator[] = [];
  gains: (Node & { gain: Param })[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createOscillator = () => {
    const o = new Oscillator();
    this.oscillators.push(o);
    return o;
  };
  createGain = () => {
    const g = Object.assign(new Node(), { gain: new Param() });
    this.gains.push(g);
    return g;
  };
}
function fixture() {
  const context = new Context(),
    report = vi.fn();
  const factory = vi.fn(() => context as unknown as AudioContext);
  return {
    context,
    report,
    factory,
    player: new MelodyPlayer(report, factory),
  };
}
afterEach(() => vi.useRealTimers());

describe("the returning melody", () => {
  it("brings the same three bell pitches home, then resolves to the tonic", () => {
    const motif = sequence.map((bell) => bellPitches[bell]);
    expect(
      scoreFor("home")
        .slice(0, 3)
        .map((n) => n.pitch),
    ).toEqual(motif);
    expect(scoreFor("star-found").map((n) => n.pitch)).toEqual(
      motif.map((n) => n * 2),
    );
    expect(
      scoreFor("home")
        .slice(-2)
        .map((n) => n.pitch),
    ).toEqual([motif[0], motif[0] / 2]);
    for (const cue of [...sequence, "star-found", "home"] as const) {
      const score = scoreFor(cue);
      expect(score.length).toBeLessThanOrEqual(7);
      expect(
        Math.max(...score.map((n) => n.at + n.length)),
      ).toBeLessThanOrEqual(4.4);
      expect(score.every((n) => n.level > 0 && n.level <= 1 && n.at >= 0)).toBe(
        true,
      );
    }
  });
  it("rings a wrong bell gently but ignores remote, moving, paused and completed inputs", () => {
    const atBells: Quest = {
      ...initialQuest(),
      stage: "bell_gate",
      location: "bells",
    };
    const ring = { type: "bell", bell: "star" } as const;
    expect(soundForAction(atBells, quest(atBells, ring), ring)).toBe("star");
    for (const before of [
      initialQuest(),
      { ...atBells, paused: true },
      { ...atBells, target: "garden" as const },
      { ...atBells, stage: "complete" as const },
    ])
      expect(soundForAction(before, quest(before, ring), ring)).toBeNull();
  });
  it("collection sounds once; duplicate collection, mailbox hints and delivery do not play a tune", () => {
    const before: Quest = {
      ...initialQuest(),
      stage: "star_garden",
      location: "garden",
    };
    const action = { type: "interact" } as const;
    const after = quest(before, action);
    expect(soundForAction(before, after, action)).toBe("star-found");
    expect(soundForAction(after, quest(after, action), action)).toBeNull();
    for (const s of [
      { ...after, location: "mailbox" as const },
      { ...before, location: "mailbox" as const },
    ])
      expect(soundForAction(s, quest(s, action), action)).toBeNull();
  });
  it("lazily resumes one context and schedules a bounded, softly enveloped score", async () => {
    const { player, factory, context, report } = fixture();
    expect(factory).not.toHaveBeenCalled();
    expect(await player.play("home")).toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.oscillators).toHaveLength(14);
    expect(context.oscillators[0].start).toHaveBeenCalledWith(10.035);
    expect(
      context.oscillators[0].frequency.setValueAtTime,
    ).toHaveBeenCalledWith(bellPitches.circle, 10.035);
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(
      0,
      10.035,
    );
    expect(report).toHaveBeenLastCalledWith({ phase: "playing", cue: "home" });
    await player.play("circle");
    expect(factory).toHaveBeenCalledOnce();
    expect(context.oscillators).toHaveLength(16);
    expect(
      context.gains
        .slice(0, 14)
        .every((g) => g.disconnect.mock.calls.length === 1),
    ).toBe(true);
    player.dispose();
  });
  it("mute/pause-style stop cancels a pending resume without late sound", async () => {
    const { player, context, report } = fixture();
    let release!: () => void;
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = player.play("home");
    player.stop();
    release();
    expect(await pending).toBe(false);
    expect(context.oscillators).toHaveLength(0);
    expect(report).toHaveBeenLastCalledWith({ phase: "idle", cue: null });
  });
  it("new input fences an older asynchronous play request", async () => {
    const { player, context } = fixture();
    const releases: (() => void)[] = [];
    context.resume.mockImplementation(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const old = player.play("home"),
      latest = player.play("triangle");
    releases[0]();
    releases[1]();
    expect(await old).toBe(false);
    expect(await latest).toBe(true);
    expect(context.oscillators).toHaveLength(2);
    player.dispose();
  });
  it("handles rejected or unavailable audio without throwing and permits an explicit retry", async () => {
    const { player, context, report } = fixture();
    context.resume.mockRejectedValueOnce(new Error("Blocked"));
    expect(await player.play("home")).toBe(false);
    expect(report).toHaveBeenLastCalledWith({
      phase: "unavailable",
      cue: null,
    });
    expect(await player.play("circle")).toBe(true);
    player.dispose();
    const unavailable = new MelodyPlayer(report, () => {
      throw new Error("Unsupported");
    });
    expect(await unavailable.play("home")).toBe(false);
    unavailable.dispose();
  });
  it("a resume deadline cannot later resurrect a timed-out cue", async () => {
    vi.useFakeTimers();
    const { player, context, report } = fixture();
    let release!: () => void;
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = player.play("home");
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toBe(false);
    release();
    await Promise.resolve();
    expect(context.oscillators).toHaveLength(0);
    expect(report).toHaveBeenLastCalledWith({
      phase: "unavailable",
      cue: null,
    });
    player.dispose();
  });
  it("natural endings release nodes and unmount closes the context, even with pending resume", async () => {
    const { player, context, report } = fixture();
    await player.play("home");
    context.oscillators.forEach((o) => o.onended?.());
    expect(report).toHaveBeenLastCalledWith({ phase: "idle", cue: null });
    expect(
      context.oscillators.every((o) => o.disconnect.mock.calls.length === 1),
    ).toBe(true);
    let release!: () => void;
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = player.play("home");
    player.dispose();
    release();
    expect(await pending).toBe(false);
    expect(context.close).toHaveBeenCalledOnce();
    expect(await player.play("home")).toBe(false);
  });
});
