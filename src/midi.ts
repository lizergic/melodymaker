import { Midi } from "@tonejs/midi";
import type { Melody } from "./engine";
import { chordPitchClasses } from "./theory";

const CHORD_BASE = 48; // C3-ish root area for the backing track

export function toMidi(melody: Melody, withChords = true): Midi {
  const midi = new Midi();
  midi.header.setTempo(melody.input.tempo);
  const secPerBeat = 60 / melody.input.tempo;

  const mel = midi.addTrack();
  mel.name = "Melody";
  for (const n of melody.notes) {
    mel.addNote({
      midi: n.midi,
      time: n.startBeat * secPerBeat,
      duration: n.durBeats * secPerBeat,
      velocity: n.velocity / 127,
    });
  }

  if (withChords) {
    const ch = midi.addTrack();
    ch.name = "Chords";
    const totalBeats = melody.input.bars * melody.input.beatsPerBar;
    const beatsPerChord = totalBeats / melody.input.chords.length;
    melody.input.chords.forEach((sym, i) => {
      const start = i * beatsPerChord * secPerBeat;
      const dur = beatsPerChord * secPerBeat;
      for (const pc of chordPitchClasses(sym)) {
        ch.addNote({ midi: CHORD_BASE + pc, time: start, duration: dur, velocity: 0.55 });
      }
    });
  }

  return midi;
}

export function toMidiBlob(melody: Melody, withChords = true): Blob {
  // toArray() returns a freshly-allocated Uint8Array spanning its whole buffer.
  // .buffer cast sidesteps TS's SharedArrayBuffer-vs-ArrayBuffer narrowing; no copy.
  const bytes = toMidi(melody, withChords).toArray();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" });
}

export function midiFilename(input: Melody["input"]): string {
  return `melodymaker_${input.key}_${input.scale}_${input.seed}.mid`.replace(/\s+/g, "-");
}
