import { describe, expect, it } from "vitest";
import { example } from "../src/domain/config";
import {
  entranceEase,
  permittedDrawing,
  reveal,
  type RevealPhase,
} from "../src/domain/reveal";

describe("drawing meets world presentation", () => {
  it("never reveals a drawing without explicit permission, even if its URL exists", () => {
    expect(permittedDrawing(example)).toBe("/sample-drawing.png");
    expect(
      permittedDrawing({
        ...example,
        config: { ...example.config, showDrawing: false },
      }),
    ).toBeUndefined();
    expect(
      permittedDrawing({ ...example, drawingUrl: undefined }),
    ).toBeUndefined();
  });
  it("lifts the drawing before introducing the hero", () => {
    let s = reveal("sealed", {
      type: "open",
      withDrawing: true,
      reduced: false,
    });
    expect(s).toBe("drawing");
    s = reveal(s, { type: "drawing-ready" });
    expect(s).toBe("hero");
    expect(reveal(s, { type: "open", withDrawing: true, reduced: false })).toBe(
      "hero",
    );
    s = reveal(s, { type: "enter" });
    expect(s).toBe("entering");
    expect(reveal(s, { type: "arrive" })).toBe("playing");
  });
  it("shows a static hero introduction for reduced motion or hidden drawings", () => {
    expect(
      reveal("sealed", { type: "open", withDrawing: true, reduced: true }),
    ).toBe("hero");
    expect(
      reveal("sealed", { type: "open", withDrawing: false, reduced: false }),
    ).toBe("hero");
  });
  it("permits skipping every reveal phase but does not bypass the sealed gift", () => {
    for (const s of ["drawing", "hero", "entering", "playing"] as RevealPhase[])
      expect(reveal(s, { type: "skip" })).toBe("playing");
    expect(reveal("sealed", { type: "skip" })).toBe("sealed");
  });
  it("ignores stale timer events and replay starts a fresh sealed gift", () => {
    expect(reveal("sealed", { type: "arrive" })).toBe("sealed");
    expect(reveal("hero", { type: "arrive" })).toBe("hero");
    expect(reveal("playing", { type: "drawing-ready" })).toBe("playing");
    expect(reveal("playing", { type: "enter" })).toBe("playing");
    expect(reveal("playing", { type: "replay" })).toBe("sealed");
  });
  it("clamps the camera transition and eases exactly between its endpoints", () => {
    expect(entranceEase(-1)).toBe(0);
    expect(entranceEase(0)).toBe(0);
    expect(entranceEase(0.5)).toBe(0.5);
    expect(entranceEase(1)).toBe(1);
    expect(entranceEase(2)).toBe(1);
  });
});
