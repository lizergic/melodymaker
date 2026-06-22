import { mulberry32, randInt, weightedPick } from "./rng";
import { scalePitchClasses, chordPitchClasses, nearestMidi } from "./theory";

export type GenInput = {
  key: string;
  scale: string;
  chords: string[];
  bars: number;
  beatsPerBar: number;
  tempo: number;
  seed: number;
};

export type Note = {
  midi: number;
  startBeat: number;
  durBeats: number;
  velocity: number;
};

export type Melody = { notes: Note[]; input: GenInput };

const center = 67;
const range = 9;
export const REGISTER = { center, range, lo: center - range, hi: center + range };

// Each cell fills one beat with sub-note durations (in beats).
const RHYTHM_CELLS: { durs: number[]; weight: number }[] = [
  { durs: [1], weight: 4 }, // quarter
  { durs: [0.5, 0.5], weight: 4 }, // two eighths
  { durs: [0.75, 0.25], weight: 2 }, // dotted-eighth + sixteenth
  { durs: [0.25, 0.25, 0.5], weight: 1 }, // two sixteenths + eighth
];

// Favor the 3rd (index 1) and 7th (index 3) for color over root/5th.
function pickChordTonePc(rng: () => number, chordPcs: number[]): number {
  const weights = chordPcs.map((_, i) => (i === 1 || i === 3 ? 3 : 1));
  return weightedPick(rng, chordPcs, weights);
}

export function generate(input: GenInput): Melody {
  const rng = mulberry32(input.seed);
  const scalePcs = scalePitchClasses(input.key, input.scale);
  const { lo, hi } = REGISTER;
  const totalBeats = input.bars * input.beatsPerBar;
  // ponytail: even split; if chords don't divide totalBeats evenly the last
  // chord just runs longer. Fine for v1 — add per-chord bar counts if it matters.
  const beatsPerChord = totalBeats / input.chords.length;
  const half = Math.floor(input.beatsPerBar / 2);

  const chordAt = (beat: number) =>
    input.chords[Math.min(input.chords.length - 1, Math.floor(beat / beatsPerChord))];

  const notes: Note[] = [];
  let prevMidi = center;

  for (let beat = 0; beat < totalBeats; beat++) {
    const beatInBar = beat % input.beatsPerBar;
    const chordPcs = chordPitchClasses(chordAt(beat));
    const cell = weightedPick(
      rng,
      RHYTHM_CELLS,
      RHYTHM_CELLS.map((c) => c.weight),
    );

    let offset = 0;
    for (let i = 0; i < cell.durs.length; i++) {
      const dur = cell.durs[i];
      const strong = (beatInBar === 0 || beatInBar === half) && i === 0;

      // Occasional rest on a weak subdivision keeps phrases from feeling robotic.
      if (!strong && randInt(rng, 0, 7) === 0) {
        offset += dur;
        continue;
      }

      // Contour: step most of the time, occasional leap.
      const leap = !strong && randInt(rng, 0, 5) === 0;
      const span = leap ? randInt(rng, 3, 7) : randInt(rng, 1, 2);
      const dir = randInt(rng, 0, 1) === 0 ? -1 : 1;
      const ref = Math.max(lo, Math.min(hi, prevMidi + dir * span));

      const midi = strong
        ? nearestMidi([pickChordTonePc(rng, chordPcs)], ref, lo, hi)
        : nearestMidi(scalePcs, ref, lo, hi);

      notes.push({
        midi,
        startBeat: beat + offset,
        durBeats: dur,
        velocity: strong ? 100 : 78,
      });
      prevMidi = midi;
      offset += dur;
    }
  }

  return { notes, input };
}
