import * as Tone from "tone";
import type { Melody } from "./engine";
import { chordPitchClasses } from "./theory";

let synth: Tone.PolySynth | null = null;
let active = false; // synchronous play-guard; survives the `await Tone.start()` race

function getSynth(): Tone.PolySynth {
  if (!synth) synth = new Tone.PolySynth(Tone.Synth).toDestination();
  return synth;
}

const toNote = (midi: number) => Tone.Frequency(midi, "midi").toNote();

export function isPlaying(): boolean {
  return active;
}

// Current transport time in seconds — for the UI playhead. 0 when stopped.
export function position(): number {
  return Tone.Transport.seconds;
}

export async function play(melody: Melody, withChords = true): Promise<void> {
  // Idempotent: a click while already playing is a no-op, not a second layer.
  // The guard is set synchronously, BEFORE the await, so rapid double-clicks on
  // the very first play (transport not started yet) can't both slip through.
  if (active) return;
  active = true;

  await Tone.start();
  Tone.Transport.cancel(0);
  const s = getSynth();
  const secPerBeat = 60 / melody.input.tempo;
  const totalBeats = melody.input.bars * melody.input.beatsPerBar;
  Tone.Transport.bpm.value = melody.input.tempo;

  for (const n of melody.notes) {
    Tone.Transport.schedule((t) => {
      s.triggerAttackRelease(toNote(n.midi), n.durBeats * secPerBeat, t, n.velocity / 127);
    }, n.startBeat * secPerBeat);
  }

  if (withChords) {
    const beatsPerChord = totalBeats / melody.input.chords.length;
    melody.input.chords.forEach((sym, i) => {
      const names = chordPitchClasses(sym).map((pc) => toNote(48 + pc));
      Tone.Transport.schedule((t) => {
        s.triggerAttackRelease(names, beatsPerChord * secPerBeat, t, 0.45);
      }, i * beatsPerChord * secPerBeat);
    });
  }

  // Auto-stop once the last note has rung out, so the guard resets and Play re-arms.
  Tone.Transport.scheduleOnce(() => stop(), totalBeats * secPerBeat + 0.5);

  Tone.Transport.position = 0;
  Tone.Transport.start();
}

export function stop(): void {
  Tone.Transport.stop();
  Tone.Transport.cancel(0);
  synth?.releaseAll(); // kill any voices still ringing so nothing bleeds into a restart
  active = false;
}
