import { describe, it, expect } from "vitest";
import { mulberry32, randInt, pick, weightedPick } from "../src/rng";

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces floats in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randInt stays within inclusive bounds", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = randInt(r, 3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("pick returns an element of the array", () => {
    const r = mulberry32(2);
    const arr = ["a", "b", "c"];
    expect(arr).toContain(pick(r, arr));
  });

  it("weightedPick only ever returns zero-weight-excluded items", () => {
    const r = mulberry32(3);
    const items = ["x", "y"];
    for (let i = 0; i < 50; i++) {
      expect(weightedPick(r, items, [0, 1])).toBe("y");
    }
  });
});
