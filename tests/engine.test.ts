import { describe, it, expect } from "vitest";
import { generate, REGISTER, type GenInput } from "../src/engine";
import { scalePitchClasses, chordPitchClasses } from "../src/theory";

const INPUT: GenInput = {
  key: "C",
  scale: "major",
  chords: ["Cmaj7", "Am7", "Dm7", "G7"],
  bars: 4,
  beatsPerBar: 4,
  tempo: 100,
  seed: 12345,
};

describe("engine.generate", () => {
  it("produces notes", () => {
    expect(generate(INPUT).notes.length).toBeGreaterThan(0);
  });

  it("is deterministic for a seed", () => {
    expect(generate(INPUT)).toEqual(generate(INPUT));
  });

  it("keeps every note within the register bounds", () => {
    for (const n of generate(INPUT).notes) {
      expect(n.midi).toBeGreaterThanOrEqual(REGISTER.lo);
      expect(n.midi).toBeLessThanOrEqual(REGISTER.hi);
    }
  });

  it("puts a chord tone on every strong-beat onset", () => {
    const { notes } = generate(INPUT);
    const totalBeats = INPUT.bars * INPUT.beatsPerBar;
    const beatsPerChord = totalBeats / INPUT.chords.length;
    const half = Math.floor(INPUT.beatsPerBar / 2);
    for (const n of notes) {
      const isOnInteger = Number.isInteger(n.startBeat);
      if (!isOnInteger) continue;
      const beatInBar = n.startBeat % INPUT.beatsPerBar;
      const isStrong = beatInBar === 0 || beatInBar === half;
      if (!isStrong) continue;
      const chord =
        INPUT.chords[Math.min(INPUT.chords.length - 1, Math.floor(n.startBeat / beatsPerChord))];
      expect(chordPitchClasses(chord)).toContain(((n.midi % 12) + 12) % 12);
    }
  });

  // Strong onsets are chord tones (tested above); every OTHER note must be a
  // scale tone. Asserting scale-membership specifically (not "scale OR chord")
  // catches a regression where weak beats wrongly emit off-scale chord tones.
  it("uses scale tones for every weak/passing note", () => {
    const { notes } = generate(INPUT);
    const scalePcs = scalePitchClasses(INPUT.key, INPUT.scale);
    const half = Math.floor(INPUT.beatsPerBar / 2);
    for (const n of notes) {
      const beatInBar = n.startBeat % INPUT.beatsPerBar;
      const isStrongOnset =
        Number.isInteger(n.startBeat) && (beatInBar === 0 || beatInBar === half);
      if (isStrongOnset) continue;
      expect(scalePcs).toContain(((n.midi % 12) + 12) % 12);
    }
  });
});
