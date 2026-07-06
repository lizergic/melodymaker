import { describe, expect, it } from "vitest";
import { generateChords } from "./progressions";
import { mulberry32 } from "./rng";
import { SCALES, isValidChord } from "./theory";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Pinned to exercise all 12 (pool entry × triads/7ths) branches generateChords
// can take — see branchOf below, and the self-check test that keeps this pin honest.
const SEEDS = [0, 1, 2, 4, 5, 7, 8, 9, 10, 14, 18, 30];

// Mirrors generateChords' first two rng draws — POOL has 6 entries, then one
// coin-flip decides triads vs sevenths — so we can prove SEEDS above actually
// covers every branch without depending on key/scale (the branch is seed-only).
const branchOf = (seed: number) => {
  const rng = mulberry32(seed);
  return `${Math.floor(rng() * 6)}:${rng() < 0.5}`;
};

describe("generateChords", () => {
  it("SEEDS cover all 12 pool-entry × triads/7ths branches", () => {
    expect(new Set(SEEDS.map(branchOf)).size).toBe(12);
  });

  it("returns valid, deterministic progressions for every key/scale/seed", () => {
    for (const key of KEYS) {
      for (const scale of SCALES) {
        for (const seed of SEEDS) {
          const chords = generateChords(key, scale, seed);
          expect(chords.length).toBeGreaterThanOrEqual(2);
          for (const c of chords) {
            expect(isValidChord(c), `${key} ${scale} seed ${seed} → "${c}"`).toBe(true);
          }
          expect(generateChords(key, scale, seed)).toEqual(chords);
        }
      }
    }
  });

  it("different seeds can produce different progressions", () => {
    const a = generateChords("C", "major", 1);
    const b = generateChords("C", "major", 2);
    const c = generateChords("C", "major", 3);
    // at least one of three seeds differs from the others (pool has 6 entries × 2 flavors)
    expect(a.join() === b.join() && b.join() === c.join()).toBe(false);
  });
});
