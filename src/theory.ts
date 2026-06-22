import { Scale, Chord, Note } from "tonal";

export const SCALES = [
  "major",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "aeolian",
  "locrian",
  "harmonic minor",
  "melodic minor",
  "major pentatonic",
  "minor pentatonic",
  "blues",
] as const;

export function scalePitchClasses(key: string, scale: string): number[] {
  return Scale.get(`${key} ${scale}`)
    .notes.map((n) => Note.chroma(n))
    .filter((c): c is number => c != null);
}

export function chordPitchClasses(symbol: string): number[] {
  return Chord.get(symbol)
    .notes.map((n) => Note.chroma(n))
    .filter((c): c is number => c != null);
}

export function isValidChord(symbol: string): boolean {
  if (!symbol.trim()) return false;
  const c = Chord.get(symbol);
  return !c.empty && c.notes.length > 0;
}

export function nearestMidi(
  targetPcs: number[],
  refMidi: number,
  lo: number,
  hi: number,
): number {
  let best = -1;
  let bestDist = Infinity;
  for (let m = lo; m <= hi; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (!targetPcs.includes(pc)) continue;
    const d = Math.abs(m - refMidi);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best === -1 ? refMidi : best;
}
