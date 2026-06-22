import { describe, it, expect } from "vitest";
import {
  SCALES,
  scalePitchClasses,
  chordPitchClasses,
  isValidChord,
  nearestMidi,
} from "../src/theory";

describe("theory", () => {
  it("lists the supported scales", () => {
    expect(SCALES).toContain("major");
    expect(SCALES).toContain("blues");
    expect(SCALES.length).toBe(12);
  });

  it("computes C major pitch classes", () => {
    expect(scalePitchClasses("C", "major")).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("computes Cmaj7 chord tones", () => {
    expect(chordPitchClasses("Cmaj7")).toEqual([0, 4, 7, 11]);
  });

  it("validates chord symbols", () => {
    expect(isValidChord("Cmaj7")).toBe(true);
    expect(isValidChord("F#m7b5")).toBe(true);
    expect(isValidChord("zzz")).toBe(false);
    expect(isValidChord("")).toBe(false);
  });

  it("finds the nearest in-set MIDI note, ties favor lower", () => {
    // C pitch class only; ref D4=62 -> C4=60 (dist 2) beats C5=72 (dist 10)
    expect(nearestMidi([0], 62, 48, 84)).toBe(60);
  });

  it("respects the register bounds", () => {
    const m = nearestMidi([0, 4, 7], 200, 58, 76);
    expect(m).toBeGreaterThanOrEqual(58);
    expect(m).toBeLessThanOrEqual(76);
  });
});
