import { describe, expect, it } from "vitest";
import {
  DEDICATION_LIMIT,
  GiftConfigSchema,
  defaults,
} from "../src/domain/config";

describe("the optional traveling dedication", () => {
  it("defaults old configs and new drafts to no dedication", () => {
    const { dedication: _removed, ...legacy } = defaults;
    expect(GiftConfigSchema.parse(legacy).dedication).toBe("");
    expect(GiftConfigSchema.parse({}).dedication).toBe("");
  });
  it("trims a dedication and permits clearing it", () => {
    expect(
      GiftConfigSchema.parse({ dedication: "  Our Saturday adventures  " })
        .dedication,
    ).toBe("Our Saturday adventures");
    expect(GiftConfigSchema.parse({ dedication: "   " }).dedication).toBe("");
  });
  it("accepts the limit and rejects oversized or non-text input", () => {
    expect(
      GiftConfigSchema.parse({ dedication: "x".repeat(DEDICATION_LIMIT) })
        .dedication,
    ).toHaveLength(DEDICATION_LIMIT);
    for (const dedication of ["x".repeat(DEDICATION_LIMIT + 1), 7, null])
      expect(GiftConfigSchema.safeParse({ dedication }).success).toBe(false);
  });
  it("preserves the creator's literal words, punctuation and Unicode", () => {
    const dedication = "Luna & Sol <3 — “our tiny universe” 🌙";
    expect(GiftConfigSchema.parse({ dedication }).dedication).toBe(dedication);
  });
});
