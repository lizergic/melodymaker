import { Chord, Scale } from "tonal";
import { mulberry32, pick } from "./rng";
import { isValidChord } from "./theory";

// Progressions as 0-indexed scale degrees. Built diatonically, so the same
// list adapts to the mode: [0, 4, 5, 3] is I–V–vi–IV in major, i–v–VI–iv in aeolian.
const POOL: number[][] = [
  [0, 4, 5, 3], // I–V–vi–IV (pop)
  [0, 5, 3, 4], // I–vi–IV–V (50s)
  [1, 4, 0, 0], // ii–V–I
  [0, 5, 1, 4], // I–vi–ii–V
  [0, 3, 4, 3], // I–IV–V–IV
  [5, 3, 0, 4], // vi–IV–I–V
];

// Chords borrow the parent heptatonic for <7-note scales; the melody keeps the real scale.
const PARENT: Record<string, string> = {
  "major pentatonic": "major",
  "minor pentatonic": "aeolian",
  blues: "aeolian",
};

// First detected symbol that round-trips through Chord.get; slash chords excluded
// because downstream only reads pitch classes and slash basses confuse Chord.get.
function nameChord(notes: string[]): string | null {
  return Chord.detect(notes).find((s) => !s.includes("/") && isValidChord(s)) ?? null;
}

export function generateChords(key: string, scale: string, seed: number): string[] {
  const rng = mulberry32(seed); // own instance — melody's RNG stream stays untouched
  const scaleNotes = Scale.get(`${key} ${PARENT[scale] ?? scale}`).notes;
  const degrees = pick(rng, POOL);
  const sevenths = rng() < 0.5; // one coin-flip per generation: all triads or all 7ths

  return degrees.map((d) => {
    const stack = (len: number) =>
      Array.from({ length: len }, (_, i) => scaleNotes[(d + 2 * i) % 7]);
    return (
      (sevenths ? nameChord(stack(4)) : null) ??
      nameChord(stack(3)) ??
      scaleNotes[d] // bare note name parses as a major triad; always valid
    );
  });
}
