import { describe, expect, it } from "vitest";
import { advanceLetter, letter, LETTER_OPEN_MS } from "../src/domain/letter";

describe("a delivered letter", () => {
  it("waits for an explicit open and rejects stale animation completion", () => {
    expect(letter("sealed", { type: "opened" })).toBe("sealed");
    expect(letter("sealed", { type: "open", reduced: false })).toBe("opening");
    expect(letter("opening", { type: "opened" })).toBe("reading");
  });
  it("ignores duplicate opens and completion events", () => {
    expect(letter("opening", { type: "open", reduced: false })).toBe("opening");
    expect(letter("reading", { type: "open", reduced: false })).toBe("reading");
    expect(letter("reading", { type: "opened" })).toBe("reading");
  });
  it("folds and reopens without a new adventure", () => {
    expect(letter("reading", { type: "fold" })).toBe("sealed");
    expect(letter("opening", { type: "fold" })).toBe("sealed");
    expect(letter("sealed", { type: "open", reduced: true })).toBe("reading");
  });
  it("uses a bounded clock, freezes on pause and skips motion when requested", () => {
    expect(advanceLetter(100, 50, false, false)).toBe(150);
    expect(advanceLetter(100, 1000, false, false)).toBe(200);
    expect(advanceLetter(100, -50, false, false)).toBe(100);
    expect(advanceLetter(100, 50, true, false)).toBe(100);
    expect(advanceLetter(LETTER_OPEN_MS - 10, 100, false, false)).toBe(
      LETTER_OPEN_MS,
    );
    expect(advanceLetter(0, 0, true, true)).toBe(LETTER_OPEN_MS);
  });
});
