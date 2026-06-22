import * as Tone from "tone";
import type { Melody } from "./engine";
import { chordPitchClasses } from "./theory";

let synth: Tone.PolySynth | null = null;

function getSynth(): Tone.PolySynth {
  if (!synth) synth = new Tone.PolySynth(Tone.Synth).toDestination();
  return synth;
}

const toNote = (midi: number) => Tone.Frequency(midi, "midi").toNote();

export async function play(melody: Melody, withChords = true): Promise<void> {
  await Tone.start();
  stop();
  const s = getSynth();
  const secPerBeat = 60 / melody.input.tempo;
  Tone.Transport.bpm.value = melody.input.tempo;

  for (const n of melody.notes) {
    Tone.Transport.schedule((t) => {
      s.triggerAttackRelease(toNote(n.midi), n.durBeats * secPerBeat, t, n.velocity / 127);
    }, n.startBeat * secPerBeat);
  }

  if (withChords) {
    const totalBeats = melody.input.bars * melody.input.beatsPerBar;
    const beatsPerChord = totalBeats / melody.input.chords.length;
    melody.input.chords.forEach((sym, i) => {
      const names = chordPitchClasses(sym).map((pc) => toNote(48 + pc));
      Tone.Transport.schedule((t) => {
        s.triggerAttackRelease(names, beatsPerChord * secPerBeat, t, 0.45);
      }, i * beatsPerChord * secPerBeat);
    });
  }

  Tone.Transport.position = 0;
  Tone.Transport.start();
}

export function stop(): void {
  Tone.Transport.stop();
  Tone.Transport.cancel(0);
}
