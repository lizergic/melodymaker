# MelodyMaker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app that generates harmonically-aware melodies from a key+scale and chord progression, with audition, re-roll, MIDI export, and a local history of the last 10 generations.

**Architecture:** A pure-TypeScript generation engine (no DOM/audio deps) is the core. Thin shells around it handle theory lookups (tonal), playback (Tone.js), MIDI export (@tonejs/midi), local history (localStorage), and a vanilla-TS UI. Deployed static to Cloudflare Pages.

**Tech Stack:** Vite, TypeScript, Vitest, tonal, Tone.js, @tonejs/midi.

## Global Constraints

- Node 18+; package manager npm.
- Dependencies pinned via committed `package-lock.json`. Do not add deps beyond: `tonal`, `tone`, `@tonejs/midi` (runtime) and `vite`, `typescript`, `vitest`, `jsdom` (dev).
- TypeScript `strict: true`.
- The engine (`src/engine.ts`, `src/rng.ts`, `src/theory.ts`) must not import any DOM, Tone, or browser API — keep it portable for the deferred ML/VST paths.
- No `Math.random` / `Date.now` inside the engine — randomness comes only from the seeded RNG. (The UI may use them to pick a seed.)
- Register bounds for generated notes: center MIDI 67, range ±9 semitones → `[58, 76]`.
- Scales supported (tonal names): `major, dorian, phrygian, lydian, mixolydian, aeolian, locrian, harmonic minor, melodic minor, major pentatonic, minor pentatonic, blues`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `index.html`, `src/main.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working Vite dev server and Vitest runner that later tasks build on.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
*.local
.DS_Store
```

- [ ] **Step 2: Init project and install deps**

Run:
```bash
npm init -y
npm install tonal tone @tonejs/midi
npm install -D vite typescript vitest jsdom
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Write `vite.config.ts` and `vitest.config.ts`**

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
export default defineConfig({ build: { outDir: "dist" } });
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 5: Edit `package.json` scripts**

Set the `"scripts"` field to:
```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```
Also add `"type": "module"`.

- [ ] **Step 6: Write minimal `index.html` and `src/main.ts`**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MelodyMaker</title>
  </head>
  <body>
    <div id="app">MelodyMaker</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
console.log("MelodyMaker booting");
```

- [ ] **Step 7: Write `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Verify test runner and build**

Run: `npm test`
Expected: 1 passing test.
Run: `npm run build`
Expected: build succeeds, `dist/` created.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

### Task 2: Seeded RNG (`src/rng.ts`)

**Files:**
- Create: `src/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mulberry32(seed: number): () => number` — returns a generator producing floats in `[0,1)`.
  - `randInt(rng: () => number, min: number, max: number): number` — inclusive both ends.
  - `pick<T>(rng: () => number, arr: T[]): T`
  - `weightedPick<T>(rng: () => number, items: T[], weights: number[]): T`

- [ ] **Step 1: Write the failing test**

`tests/rng.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mulberry32, randInt, pick, weightedPick } from "../src/rng";

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces floats in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randInt stays within inclusive bounds", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = randInt(r, 3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("pick returns an element of the array", () => {
    const r = mulberry32(2);
    const arr = ["a", "b", "c"];
    expect(arr).toContain(pick(r, arr));
  });

  it("weightedPick only ever returns zero-weight-excluded items", () => {
    const r = mulberry32(3);
    const items = ["x", "y"];
    for (let i = 0; i < 50; i++) {
      expect(weightedPick(r, items, [0, 1])).toBe("y");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rng.test.ts`
Expected: FAIL — cannot find module `../src/rng`.

- [ ] **Step 3: Write `src/rng.ts`**

```ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function weightedPick<T>(rng: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rng.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rng.ts tests/rng.test.ts
git commit -m "feat: seeded RNG helpers"
```

---

### Task 3: Theory helpers (`src/theory.ts`)

**Files:**
- Create: `src/theory.ts`
- Test: `tests/theory.test.ts`

**Interfaces:**
- Consumes: `tonal`.
- Produces:
  - `SCALES: readonly string[]` — the supported scale names.
  - `scalePitchClasses(key: string, scale: string): number[]` — pitch classes 0–11.
  - `chordPitchClasses(symbol: string): number[]` — pitch classes 0–11.
  - `isValidChord(symbol: string): boolean`
  - `nearestMidi(targetPcs: number[], refMidi: number, lo: number, hi: number): number` — MIDI note in `[lo,hi]` whose pitch class is in `targetPcs`, closest to `refMidi`; ties favor the lower note; falls back to `refMidi` if none.

- [ ] **Step 1: Write the failing test**

`tests/theory.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theory.test.ts`
Expected: FAIL — cannot find module `../src/theory`.

- [ ] **Step 3: Write `src/theory.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theory.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/theory.ts tests/theory.test.ts
git commit -m "feat: scale/chord theory helpers via tonal"
```

---

### Task 4: Generation engine (`src/engine.ts`)

**Files:**
- Create: `src/engine.ts`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `mulberry32, randInt, weightedPick` from `./rng`; `scalePitchClasses, chordPitchClasses, nearestMidi` from `./theory`.
- Produces:
  - `type GenInput = { key: string; scale: string; chords: string[]; bars: number; beatsPerBar: number; tempo: number; seed: number }`
  - `type Note = { midi: number; startBeat: number; durBeats: number; velocity: number }`
  - `type Melody = { notes: Note[]; input: GenInput }`
  - `REGISTER: { center: number; range: number; lo: number; hi: number }`
  - `generate(input: GenInput): Melody`

- [ ] **Step 1: Write the failing test**

`tests/engine.test.ts`:
```ts
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

  it("keeps every note diatonic to the key/scale or a tone of its chord", () => {
    const { notes } = generate(INPUT);
    const scalePcs = scalePitchClasses(INPUT.key, INPUT.scale);
    const totalBeats = INPUT.bars * INPUT.beatsPerBar;
    const beatsPerChord = totalBeats / INPUT.chords.length;
    for (const n of notes) {
      const chord =
        INPUT.chords[Math.min(INPUT.chords.length - 1, Math.floor(n.startBeat / beatsPerChord))];
      const allowed = new Set([...scalePcs, ...chordPitchClasses(chord)]);
      expect(allowed.has(((n.midi % 12) + 12) % 12)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine.test.ts`
Expected: FAIL — cannot find module `../src/engine`.

- [ ] **Step 3: Write `src/engine.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine.ts tests/engine.test.ts
git commit -m "feat: harmonically-aware melody generation engine"
```

---

### Task 5: Local history (`src/history.ts`)

**Files:**
- Create: `src/history.ts`
- Test: `tests/history.test.ts`

**Interfaces:**
- Consumes: `type GenInput` from `./engine`; browser `localStorage`.
- Produces:
  - `loadHistory(): GenInput[]` — newest first; `[]` if empty or corrupt.
  - `pushHistory(input: GenInput): GenInput[]` — prepends, caps at 10, persists, returns the new list.
  - `HISTORY_MAX = 10`

Note: this test needs a DOM. The test file sets the Vitest environment to jsdom via a file-level docblock.

- [ ] **Step 1: Write the failing test**

`tests/history.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadHistory, pushHistory, HISTORY_MAX } from "../src/history";
import type { GenInput } from "../src/engine";

const make = (seed: number): GenInput => ({
  key: "C",
  scale: "major",
  chords: ["Cmaj7"],
  bars: 4,
  beatsPerBar: 4,
  tempo: 100,
  seed,
});

describe("history", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("prepends newest first", () => {
    pushHistory(make(1));
    pushHistory(make(2));
    expect(loadHistory().map((i) => i.seed)).toEqual([2, 1]);
  });

  it("caps at HISTORY_MAX, dropping the oldest", () => {
    for (let s = 1; s <= HISTORY_MAX + 2; s++) pushHistory(make(s));
    const seeds = loadHistory().map((i) => i.seed);
    expect(seeds.length).toBe(HISTORY_MAX);
    expect(seeds[0]).toBe(HISTORY_MAX + 2); // newest
    expect(seeds).not.toContain(1); // oldest dropped
  });

  it("returns [] on corrupt storage", () => {
    localStorage.setItem("melodymaker.history.v1", "{not json");
    expect(loadHistory()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/history.test.ts`
Expected: FAIL — cannot find module `../src/history`.

- [ ] **Step 3: Write `src/history.ts`**

```ts
import type { GenInput } from "./engine";

const KEY = "melodymaker.history.v1";
export const HISTORY_MAX = 10;

export function loadHistory(): GenInput[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistory(input: GenInput): GenInput[] {
  const list = [input, ...loadHistory()].slice(0, HISTORY_MAX);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/history.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/history.ts tests/history.test.ts
git commit -m "feat: localStorage history ring buffer (last 10)"
```

---

### Task 6: MIDI export (`src/midi.ts`)

**Files:**
- Create: `src/midi.ts`
- Test: `tests/midi.test.ts`

**Interfaces:**
- Consumes: `Midi` from `@tonejs/midi`; `type Melody` from `./engine`; `chordPitchClasses` from `./theory`.
- Produces:
  - `toMidi(melody: Melody, withChords?: boolean): Midi` — melody track always; chord track when `withChords` (default true).
  - `toMidiBlob(melody: Melody, withChords?: boolean): Blob` — `audio/midi` Blob.
  - `midiFilename(input: Melody["input"]): string`

- [ ] **Step 1: Write the failing test**

`tests/midi.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { toMidi, toMidiBlob, midiFilename } from "../src/midi";
import { generate, type GenInput } from "../src/engine";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/midi.test.ts`
Expected: FAIL — cannot find module `../src/midi`.

- [ ] **Step 3: Write `src/midi.ts`**

```ts
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
  return new Blob([toMidi(melody, withChords).toArray()], { type: "audio/midi" });
}

export function midiFilename(input: Melody["input"]): string {
  return `melodymaker_${input.key}_${input.scale}_${input.seed}.mid`.replace(/\s+/g, "-");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/midi.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/midi.ts tests/midi.test.ts
git commit -m "feat: MIDI file export (melody + chord track)"
```

---

### Task 7: Playback (`src/audio.ts`)

**Files:**
- Create: `src/audio.ts`

**Interfaces:**
- Consumes: `Tone` from `tone`; `type Melody` from `./engine`; `chordPitchClasses` from `./theory`.
- Produces:
  - `play(melody: Melody, withChords?: boolean): Promise<void>` — starts the audio context and schedules playback from the top.
  - `stop(): void` — stops and clears the transport.

No unit test: this is browser audio (Web Audio is not available under Vitest's node/jsdom env). It is verified manually in Task 8's checklist. Keep the module tiny so it's reviewable by inspection.

- [ ] **Step 1: Write `src/audio.ts`**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/audio.ts
git commit -m "feat: Tone.js playback of melody + chords"
```

---

### Task 8: UI (`index.html`, `src/main.ts`, `src/styles.css`)

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: `generate, REGISTER, type GenInput` from `./engine`; `SCALES, isValidChord` from `./theory`; `play, stop` from `./audio`; `toMidiBlob, midiFilename` from `./midi`; `loadHistory, pushHistory` from `./history`.
- Produces: the running app. No exports.

No unit test (DOM glue); verified by the manual checklist in Step 5.

- [ ] **Step 1: Replace `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MelodyMaker</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <main id="app">
      <h1>MelodyMaker</h1>
      <div class="controls">
        <label>Key <select id="key"></select></label>
        <label>Scale <select id="scale"></select></label>
        <label>Bars <input id="bars" type="number" min="1" max="16" value="4" /></label>
        <label>Tempo <input id="tempo" type="number" min="40" max="240" value="100" /></label>
        <label class="wide">
          Chords
          <input id="chords" type="text" value="Cmaj7 Am7 Dm7 G7" />
        </label>
        <label>Presets <select id="presets"></select></label>
        <span id="chord-error" class="error"></span>
      </div>
      <div class="buttons">
        <button id="generate">Generate</button>
        <button id="play" disabled>Play</button>
        <button id="stop" disabled>Stop</button>
        <button id="download" disabled>Download MIDI</button>
      </div>
      <canvas id="roll" width="900" height="240"></canvas>
      <h2>History</h2>
      <ol id="history"></ol>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/styles.css`**

```css
:root { color-scheme: dark; font-family: system-ui, sans-serif; }
body { margin: 0; background: #14161c; color: #e6e6e6; }
#app { max-width: 960px; margin: 0 auto; padding: 24px; }
h1 { margin: 0 0 16px; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
.controls label { display: flex; flex-direction: column; font-size: 12px; gap: 4px; }
.controls .wide { flex: 1 1 260px; }
select, input, button { font: inherit; padding: 6px 8px; border-radius: 6px; border: 1px solid #333; background: #1d2029; color: #e6e6e6; }
.buttons { display: flex; gap: 8px; margin: 16px 0; }
button { cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
.error { color: #ff7a7a; font-size: 12px; align-self: center; }
canvas { width: 100%; background: #0f1116; border-radius: 8px; display: block; }
#history { padding-left: 20px; }
#history li { cursor: pointer; padding: 4px 0; }
#history li:hover { color: #9ad; }
```

- [ ] **Step 3: Replace `src/main.ts`**

```ts
import { generate, REGISTER, type GenInput, type Melody } from "./engine";
import { SCALES, isValidChord } from "./theory";
import { play, stop } from "./audio";
import { toMidiBlob, midiFilename } from "./midi";
import { loadHistory, pushHistory } from "./history";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PRESETS: Record<string, string> = {
  "ii–V–I (major)": "Dm7 G7 Cmaj7 Cmaj7",
  "I–V–vi–IV (pop)": "C G Am F",
  "i–VI–III–VII (minor)": "Am F C G",
  "12-bar blues (quick)": "C7 F7 C7 G7",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const keyEl = $<HTMLSelectElement>("key");
const scaleEl = $<HTMLSelectElement>("scale");
const barsEl = $<HTMLInputElement>("bars");
const tempoEl = $<HTMLInputElement>("tempo");
const chordsEl = $<HTMLInputElement>("chords");
const presetsEl = $<HTMLSelectElement>("presets");
const errEl = $<HTMLSpanElement>("chord-error");
const genBtn = $<HTMLButtonElement>("generate");
const playBtn = $<HTMLButtonElement>("play");
const stopBtn = $<HTMLButtonElement>("stop");
const dlBtn = $<HTMLButtonElement>("download");
const canvas = $<HTMLCanvasElement>("roll");
const historyEl = $<HTMLOListElement>("history");

let current: Melody | null = null;

function fillSelect(el: HTMLSelectElement, items: string[]) {
  el.innerHTML = items.map((v) => `<option value="${v}">${v}</option>`).join("");
}

fillSelect(keyEl, KEYS);
fillSelect(scaleEl, [...SCALES]);
fillSelect(presetsEl, ["—", ...Object.keys(PRESETS)]);

function parseChords(): string[] {
  return chordsEl.value.trim().split(/\s+/).filter(Boolean);
}

function validate(): boolean {
  const chords = parseChords();
  const bad = chords.filter((c) => !isValidChord(c));
  if (chords.length === 0) {
    errEl.textContent = "Enter at least one chord";
  } else if (bad.length) {
    errEl.textContent = `Invalid: ${bad.join(", ")}`;
  } else {
    errEl.textContent = "";
  }
  const ok = chords.length > 0 && bad.length === 0;
  genBtn.disabled = !ok;
  return ok;
}

function readInput(seed: number): GenInput {
  return {
    key: keyEl.value,
    scale: scaleEl.value,
    chords: parseChords(),
    bars: Math.max(1, Number(barsEl.value)),
    beatsPerBar: 4,
    tempo: Math.max(40, Number(tempoEl.value)),
    seed,
  };
}

function applyInput(input: GenInput) {
  keyEl.value = input.key;
  scaleEl.value = input.scale;
  chordsEl.value = input.chords.join(" ");
  barsEl.value = String(input.bars);
  tempoEl.value = String(input.tempo);
}

function draw(melody: Melody) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const totalBeats = melody.input.bars * melody.input.beatsPerBar;
  const span = REGISTER.hi - REGISTER.lo + 1;
  const cw = canvas.width / totalBeats;
  const rh = canvas.height / span;
  ctx.fillStyle = "#4fa3ff";
  for (const n of melody.notes) {
    const x = n.startBeat * cw;
    const y = (REGISTER.hi - n.midi) * rh;
    ctx.fillRect(x + 1, y + 1, n.durBeats * cw - 2, rh - 2);
  }
}

function setCurrent(melody: Melody) {
  current = melody;
  draw(melody);
  playBtn.disabled = false;
  stopBtn.disabled = false;
  dlBtn.disabled = false;
}

function renderHistory() {
  const list = loadHistory();
  historyEl.innerHTML = list
    .map(
      (h, i) =>
        `<li data-i="${i}">${h.key} ${h.scale} · ${h.chords.join(" ")} · seed ${h.seed}</li>`,
    )
    .join("");
}

genBtn.addEventListener("click", () => {
  if (!validate()) return;
  const seed = Math.floor(Math.random() * 2 ** 31);
  const melody = generate(readInput(seed));
  setCurrent(melody);
  pushHistory(melody.input);
  renderHistory();
});

playBtn.addEventListener("click", () => {
  if (current) void play(current);
});
stopBtn.addEventListener("click", () => stop());

dlBtn.addEventListener("click", () => {
  if (!current) return;
  const url = URL.createObjectURL(toMidiBlob(current));
  const a = document.createElement("a");
  a.href = url;
  a.download = midiFilename(current.input);
  a.click();
  URL.revokeObjectURL(url);
});

presetsEl.addEventListener("change", () => {
  const p = PRESETS[presetsEl.value];
  if (p) {
    chordsEl.value = p;
    validate();
  }
  presetsEl.value = "—";
});

chordsEl.addEventListener("input", validate);

historyEl.addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest("li");
  if (!li) return;
  const input = loadHistory()[Number(li.dataset.i)];
  if (!input) return;
  applyInput(input);
  setCurrent(generate(input));
});

validate();
renderHistory();
```

- [ ] **Step 4: Type-check and run the build**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification (run `npm run dev`, open the URL)**

Confirm each:
- Page loads with key/scale dropdowns populated, chords prefilled `Cmaj7 Am7 Dm7 G7`.
- Click **Generate** → notes appear in the piano-roll canvas; Play/Stop/Download enable.
- Click **Play** → audio plays melody + chords; **Stop** halts it.
- Click **Download MIDI** → a `.mid` downloads; drag it into a DAW and confirm it contains the melody.
- Type an invalid chord (e.g. `Czz`) → red error shows, Generate disables.
- Pick a **preset** → chord field updates.
- Click **Generate** several times → History list grows, capped at 10, newest on top.
- Click a **History** item → controls + canvas restore that melody.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.ts src/styles.css
git commit -m "feat: MelodyMaker UI, piano-roll, and history wiring"
```

---

### Task 9: Cloudflare Pages deploy config

**Files:**
- Create: `public/_headers`
- Create: `README.md`

**Interfaces:**
- Consumes: the Vite build output (`dist/`).
- Produces: deployable static site with security headers.

Note: Vite copies everything in `public/` to `dist/` verbatim, so `public/_headers` lands at `dist/_headers` where Cloudflare Pages reads it.

- [ ] **Step 1: Create `public/_headers`**

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: geolocation=(), camera=(), microphone=()
```

- [ ] **Step 2: Create `README.md`**

```markdown
# MelodyMaker

Generate harmonically-aware melodies from a key + scale and a chord progression.
Audition in-browser, re-roll, and export MIDI. Fully client-side; no backend.

## Develop

    npm install
    npm run dev      # local dev server
    npm test         # unit tests (engine, theory, rng, midi, history)
    npm run build    # production build -> dist/

## Deploy (Cloudflare Pages)

Connect this repo in the Cloudflare dashboard with:

- Build command: `npm run build`
- Build output directory: `dist`

`public/_headers` ships a strict Content-Security-Policy. If browser audio ever
fails to start behind the CSP, relax `worker-src` (Tone.js may use a blob
AudioWorklet) — it already includes `blob:`.

## Roadmap (deferred)

- ML-assisted generation (Cloudflare Workers AI at the edge, or client-side).
- Multiple melody tracks, humanization, swing.
```

- [ ] **Step 3: Verify the header ships in the build**

Run: `npm run build`
Expected: `dist/_headers` exists with the CSP line.

- [ ] **Step 4: Commit**

```bash
git add public/_headers README.md
git commit -m "chore: Cloudflare Pages deploy config + CSP headers"
```

---

## Self-Review

**Spec coverage:**
- Key+scale+chords → melody: Task 4. ✓
- Strong-beat chord tones / passing scale tones / voice-leading / contour / rhythm / seeded RNG: Task 4 + Task 2. ✓
- Scale list (12): Task 3 (asserted). ✓
- Chord text input + presets + inline validation: Task 8. ✓
- Audition (Tone.js): Task 7 + Task 8. ✓
- MIDI export (melody + chord track): Task 6. ✓
- Local seed-based history, last 10: Task 5 + Task 8. ✓
- Piano-roll: Task 8. ✓
- Cloudflare Pages + CSP + security: Task 9. ✓
- Pure engine boundary for deferred ML: enforced by Global Constraints + Task 4 imports. ✓
- Deferred (ML/multi-track/humanization) and out-of-scope (live MIDI, accounts): not built — README notes roadmap. ✓

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `GenInput`/`Note`/`Melody` defined in Task 4 and consumed unchanged in Tasks 5–8. `REGISTER` (with `.lo/.hi`) defined in Task 4, used in Tasks 4 & 8. `nearestMidi`/`scalePitchClasses`/`chordPitchClasses` signatures from Task 3 match all call sites. `loadHistory`/`pushHistory` signatures from Task 5 match Task 8 usage. `toMidiBlob`/`midiFilename` from Task 6 match Task 8. `play`/`stop` from Task 7 match Task 8. Consistent. ✓
