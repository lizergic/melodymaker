import { describe, expect, it } from "vitest";
import { generateChords } from "./progressions";
import { SCALES, isValidChord } from "./theory";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SEEDS = [1, 42, 123456789];

describe("generateChords", () => {
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
