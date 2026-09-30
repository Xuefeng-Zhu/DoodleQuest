import { describe, it, expect } from "vitest";
import {
  quest,
  initialQuest,
  sequence,
  type Quest,
  type Destination,
} from "../src/domain/quest";
function go(s: Quest, to: Destination) {
  return quest(quest(s, { type: "go", to }), { type: "tick", delta: 2.4 });
}
function openGate() {
  let s = go(quest(initialQuest(), { type: "open" }), "bells");
  for (const bell of sequence) s = quest(s, { type: "bell", bell });
  return s;
}
describe("A Star for You progression", () => {
  it("requires opening and proximity; locked garden cannot be selected", () => {
    let s = initialQuest();
    expect(quest(s, { type: "go", to: "garden" })).toEqual(s);
    s = quest(s, { type: "open" });
    expect(quest(s, { type: "bell", bell: "circle" })).toEqual(s);
    expect(quest(s, { type: "go", to: "garden" })).toEqual(s);
    expect(quest(s, { type: "interact" })).toEqual(s);
  });
  it("gently resets a wrong bell and opens only after the full sequence", () => {
    let s = go(quest(initialQuest(), { type: "open" }), "bells");
    s = quest(s, { type: "bell", bell: "circle" });
    s = quest(s, { type: "bell", bell: "star" });
    expect(s.bellIndex).toBe(0);
    expect(s.stage).toBe("bell_gate");
    for (const bell of sequence) s = quest(s, { type: "bell", bell });
    expect(s.stage).toBe("star_garden");
    expect(s.bellIndex).toBe(3);
    expect(quest(s, { type: "bell", bell: "star" })).toEqual(s);
  });
  it("mailbox cannot finish before collecting a star", () => {
    const s = quest(go(quest(initialQuest(), { type: "open" }), "mailbox"), {
      type: "interact",
    });
    expect(s.stage).toBe("bell_gate");
    expect(s.hint).toContain("waiting for a star");
  });
  it("blocks mid-travel collection and duplicate interactions", () => {
    let s = openGate();
    s = quest(s, { type: "go", to: "garden" });
    expect(quest(s, { type: "interact" }).stage).toBe("star_garden");
    s = quest(s, { type: "tick", delta: 2.4 });
    s = quest(s, { type: "interact" });
    expect(s.hasStar).toBe(true);
    expect(quest(s, { type: "interact" })).toEqual(s);
    s = go(s, "mailbox");
    s = quest(s, { type: "interact" });
    expect(s.stage).toBe("complete");
    expect(s.hasStar).toBe(false);
    expect(quest(s, { type: "interact" }).stage).toBe("complete");
    expect(quest(s, { type: "replay" })).toEqual(initialQuest());
  });
  it("pauses all quest actions", () => {
    const s = quest(openGate(), { type: "pause" });
    expect(quest(s, { type: "go", to: "garden" })).toEqual(s);
    expect(quest(s, { type: "tick", delta: 2.4 })).toEqual(s);
  });
});
