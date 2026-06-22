import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import {
  toMidi,
  toMidiBlob,
  toChordsMidi,
  toChordsMidiBlob,
  midiFilename,
  chordsMidiFilename,
} from "../src/midi";
import { generate, type GenInput } from "../src/engine";
import { chordPitchClasses } from "../src/theory";

const INPUT: GenInput = {
  key: "C",
  scale: "major",
  chords: ["Cmaj7", "G7"],
  bars: 2,
  beatsPerBar: 4,
  tempo: 120,
  seed: 99,
};

describe("midi", () => {
  it("writes one note per melody note (no chord track)", () => {
    const mel = generate(INPUT);
    const m = toMidi(mel, false);
    expect(m.tracks.length).toBe(1);
    expect(m.tracks[0].notes.length).toBe(mel.notes.length);
  });

  it("adds a chord track when requested", () => {
    const m = toMidi(generate(INPUT), true);
    expect(m.tracks.length).toBe(2);
    expect(m.tracks[1].notes.length).toBeGreaterThan(0);
  });

  it("round-trips through a real MIDI byte array", () => {
    const mel = generate(INPUT);
    const bytes = toMidi(mel, false).toArray();
    const reparsed = new Midi(bytes);
    expect(reparsed.tracks[0].notes.length).toBe(mel.notes.length);
  });

  it("produces a non-empty blob and a clean filename", () => {
    const blob = toMidiBlob(generate(INPUT));
    expect(blob.size).toBeGreaterThan(0);
    const name = midiFilename(INPUT);
    expect(name).toMatch(/^melodymaker_C_major_99\.mid$/);
  });

  it("exports chords only: one track, all chord tones, no melody", () => {
    const m = toChordsMidi(generate(INPUT));
    expect(m.tracks.length).toBe(1);
    const expected = INPUT.chords.reduce((s, c) => s + chordPitchClasses(c).length, 0);
    expect(m.tracks[0].notes.length).toBe(expected);
    expect(toChordsMidiBlob(generate(INPUT)).size).toBeGreaterThan(0);
    expect(chordsMidiFilename(INPUT)).toMatch(/^melodymaker_C_major_99_chords\.mid$/);
  });
});
