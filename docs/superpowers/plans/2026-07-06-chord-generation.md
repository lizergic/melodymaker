# Chord Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate chord progressions from the chosen key/scale (seeded, deterministic), render them as translucent bars in the piano roll, and demote the chord text input to an optional override behind an "auto" checkbox.

**Architecture:** New `src/progressions.ts` picks a Roman-numeral-style progression from a curated pool of scale-degree lists and names each chord diatonically via tonal's `Chord.detect`. Everything downstream (`engine.ts`, `audio.ts`, `midi.ts`, `history.ts`) already consumes `GenInput.chords: string[]` and is untouched except for consolidating the chord-octave constant. UI gains an auto checkbox (default on) and the roll extends down to MIDI 48 to show chord tones.

**Tech Stack:** TypeScript, Vite 8, tonal 6, Tone.js 15, vitest 4 (already in devDependencies, `npm test` = `vitest run`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-06-chord-generation-design.md`

## Global Constraints

- No new dependencies.
- Same seed → same chords AND same melody. `generateChords` gets its own `mulberry32(seed)` instance; the melody's RNG stream in `engine.ts` must not change.
- `generateChords` must never return an empty list or a symbol failing `isValidChord`.
- Scales with <7 notes build chords from a parent heptatonic: `major pentatonic` → `major`, `minor pentatonic` → `aeolian`, `blues` → `aeolian`. Melody keeps the selected scale.
- Chord pitches everywhere (audio, MIDI, roll) are `48 + pitchClass` (constant `CHORD_BASE = 48`).
- Windows PowerShell environment; run commands from repo root `M:\Github\melodymaker`.
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01272GGAeQiJz2cff9RzL4QK`

---

### Task 1: Chord progression generator

**Files:**
- Create: `src/progressions.ts`
- Test: `src/progressions.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `pick` from `src/rng.ts`; `isValidChord`, `SCALES` from `src/theory.ts`; `Chord`, `Scale` from `tonal`.
- Produces: `generateChords(key: string, scale: string, seed: number): string[]` — chord symbols parseable by tonal's `Chord.get` (i.e. passing `isValidChord`). Task 2 imports this in `main.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/progressions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateChords } from "./progressions";
import { SCALES, isValidChord } from "./theory";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SEEDS = [1, 42, 123456789];

describe("generateChords", () => {
  it("returns valid, deterministic progressions for every key/scale/seed", () => {
    for (const key of KEYS) {
      for (const scale of SCALES) {
        for (const seed of SEEDS) {
          const chords = generateChords(key, scale, seed);
          expect(chords.length).toBeGreaterThanOrEqual(2);
          for (const c of chords) {
            expect(isValidChord(c), `${key} ${scale} seed ${seed} → "${c}"`).toBe(true);
          }
          expect(generateChords(key, scale, seed)).toEqual(chords);
        }
      }
    }
  });

  it("different seeds can produce different progressions", () => {
    const a = generateChords("C", "major", 1);
    const b = generateChords("C", "major", 2);
    const c = generateChords("C", "major", 3);
    // at least one of three seeds differs from the others (pool has 6 entries × 2 flavors)
    expect(a.join() === b.join() && b.join() === c.join()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./progressions` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/progressions.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests). If a specific key/scale/seed combo fails validity, the assertion message names it — the fallback chain (`7th → triad → bare root`) should make this unreachable; a failure means `nameChord` returned an invalid symbol, so inspect `Chord.detect` output for that combo rather than loosening the test.

- [ ] **Step 5: Commit**

```powershell
git add src/progressions.ts src/progressions.test.ts
git commit -m "feat: seeded diatonic chord progression generator"
```

---

### Task 2: Auto-chords UI toggle

**Files:**
- Modify: `index.html:40-49` (chords field)
- Modify: `src/main.ts` (imports, `validate`, `readInput`, generate handler, new sync function)
- Modify: `src/styles.css` (label row, toggle, disabled controls)

**Interfaces:**
- Consumes: `generateChords(key, scale, seed)` from Task 1.
- Produces: `#autochords` checkbox (default checked). No exports — `main.ts` is the entry point.

- [ ] **Step 1: Add the checkbox to index.html**

Replace the `k-chords` field block (currently lines 40–44):

```html
          <div class="field k-chords">
            <div class="labelrow">
              <label for="chords">chords</label>
              <label class="autotoggle" for="autochords"><input id="autochords" type="checkbox" checked />auto</label>
            </div>
            <input id="chords" class="control" type="text" spellcheck="false" autocomplete="off"
              placeholder="Cmaj7 Am7 Dm7 G7" />
          </div>
```

Note: the `value="Cmaj7 Am7 Dm7 G7"` attribute is removed — in auto mode the input displays generated chords after Generate; in manual mode the placeholder shows the expected format.

- [ ] **Step 2: Style the toggle in styles.css**

Add after the `label .req` rule (around line 97):

```css
.labelrow { display: flex; align-items: center; justify-content: space-between; }
.autotoggle { display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--accent); }
.autotoggle input { accent-color: var(--accent); margin: 0; cursor: pointer; }
.control:disabled { opacity: 0.45; cursor: not-allowed; }
```

(`.autotoggle` is a `<label>`, so it inherits the global mono/uppercase label styling.)

- [ ] **Step 3: Wire it up in main.ts**

Add to the imports:

```ts
import { generateChords } from "./progressions";
```

Add with the other element lookups (after `presetEl`):

```ts
const autoEl = $<HTMLInputElement>("autochords");
```

Add an early return at the top of `validate()`:

```ts
function validate(): boolean {
  if (autoEl.checked) {
    errslot.dataset.state = "ok";
    errtext.textContent = "chords auto-generated from key + scale";
    genBtn.disabled = false;
    return true;
  }
  // ... existing body unchanged ...
```

Change the `chords` line in `readInput`:

```ts
    chords: autoEl.checked ? generateChords(keyEl.value, scaleEl.value, seed) : parseChords(),
```

In the `genBtn` click handler, show the resolved progression after generating (insert after `const melody = generate(readInput(seed));`):

```ts
  if (autoEl.checked) chordsEl.value = melody.input.chords.join(" ");
```

Add the sync function and listener (near the other event handlers):

```ts
function syncAutoUI() {
  chordsEl.disabled = autoEl.checked;
  presetEl.disabled = autoEl.checked;
  validate();
}
autoEl.addEventListener("change", syncAutoUI);
```

Replace the bare `validate();` at the bottom of the file with `syncAutoUI();` (it calls `validate()` and sets the initial disabled state).

- [ ] **Step 4: Verify build and behavior**

Run: `npm test` — expected: PASS (Task 1 tests unaffected).
Run: `npm run build` — expected: tsc + vite build succeed with no errors.
Run: `npm run dev`, open the URL, and check:
- On load: chords input + presets disabled, status reads "chords auto-generated from key + scale", Generate enabled.
- Generate → melody renders and plays as before, and the disabled chords input now shows the generated progression, e.g. `Cmaj7 Am7 Dm7 G7` (symbols vary by seed).
- Uncheck auto → input + presets re-enable, empty input shows "enter at least one chord", presets still fill the input, typed chords still validate.
- History restore still replays the exact stored progression.

- [ ] **Step 5: Commit**

```powershell
git add index.html src/main.ts src/styles.css
git commit -m "feat: auto-generated chords with optional manual override"
```

---

### Task 3: Render chords in the piano roll

**Files:**
- Modify: `src/theory.ts` (export `CHORD_BASE`)
- Modify: `src/midi.ts:5` (use shared constant)
- Modify: `src/audio.ts:47` (use shared constant)
- Modify: `src/main.ts` (`renderRoll`)
- Modify: `src/styles.css` (`.chordbar`)

**Interfaces:**
- Consumes: `chordPitchClasses` from `src/theory.ts` (existing).
- Produces: `CHORD_BASE = 48` exported from `src/theory.ts`; `.chordbar` elements in the roll (visual only, not in `noteEls`, never "lit").

- [ ] **Step 1: Consolidate CHORD_BASE**

`src/theory.ts` — add at the end:

```ts
// C3-ish root area for the backing chords — shared by audio, MIDI export, and the roll.
export const CHORD_BASE = 48;
```

`src/midi.ts` — delete the local `const CHORD_BASE = 48; // C3-ish root area for the backing track` and add `CHORD_BASE` to the existing theory import:

```ts
import { chordPitchClasses, CHORD_BASE } from "./theory";
```

`src/audio.ts` — add `CHORD_BASE` to the theory import and change the chord-note line:

```ts
import { chordPitchClasses, CHORD_BASE } from "./theory";
```

```ts
      const names = chordPitchClasses(sym).map((pc) => toNote(CHORD_BASE + pc));
```

- [ ] **Step 2: Extend the roll range and draw chord bars in main.ts**

Add `chordPitchClasses` and `CHORD_BASE` to the theory import:

```ts
import { SCALES, scalePitchClasses, chordPitchClasses, isValidChord, CHORD_BASE } from "./theory";
```

In `renderRoll`, change the range line:

```ts
  const hi = REGISTER.hi;
  const lo = CHORD_BASE; // roll spans chord octave (48+) up through the melody register
  const lanes = hi - lo + 1;
```

Change the note-removal line to also clear chord bars, and insert the chord bars BEFORE the melody-note loop (chord bars first in DOM = painted underneath):

```ts
  roll.querySelectorAll(".note, .chordbar").forEach((n) => n.remove());

  // chord tones as translucent bars at their played pitches
  const beatsPerChord = totalBeats / melody.input.chords.length;
  melody.input.chords.forEach((sym, i) => {
    for (const pc of chordPitchClasses(sym)) {
      const el = document.createElement("div");
      el.className = "chordbar";
      el.style.left = `${((i * beatsPerChord) / totalBeats) * 100}%`;
      el.style.width = `calc(${(beatsPerChord / totalBeats) * 100}% - 1px)`;
      el.style.top = `calc(${((hi - (CHORD_BASE + pc)) / lanes) * 100}% + 1px)`;
      el.style.height = `calc(${(1 / lanes) * 100}% - 2px)`;
      roll.insertBefore(el, playhead);
    }
  });

  noteEls = [];
  for (const n of melody.notes) {
    // ... existing melody-note loop unchanged ...
```

(The existing `noteEls = [];` line moves after the chord bars; the melody loop body itself is unchanged.)

- [ ] **Step 3: Style chord bars in styles.css**

Add after the `.note.lit` rule (around line 203):

```css
.chordbar {
  position: absolute; border-radius: 2px; pointer-events: none;
  background: rgba(74, 222, 128, 0.12);
  border: 1px solid rgba(74, 222, 128, 0.26);
}
```

(Mint hue from the existing palette vs. the melody's purple; low opacity, no glow.)

- [ ] **Step 4: Verify**

Run: `npm test` — expected: PASS.
Run: `npm run build` — expected: no errors.
Run: `npm run dev` and check:
- Generate → faint mint bars sit in the lower third of the roll, changing on chord boundaries; purple melody notes render above them, roll is denser (29 lanes) but readable.
- Play → playhead lights melody notes only; chord bars never light up.
- Download midi / download chords → chord track notes still start at MIDI 48.

- [ ] **Step 5: Commit**

```powershell
git add src/theory.ts src/midi.ts src/audio.ts src/main.ts src/styles.css
git commit -m "feat: render chord tones as translucent bars in the piano roll"
```

---

### Task 4: README line + final verification

**Files:**
- Modify: `README.md:3`

- [ ] **Step 1: Update the README tagline**

Change line 3 from:

```
Generate harmonically-aware melodies from a key + scale and a chord progression.
```

to:

```
Generate harmonically-aware melodies — and the chord progression under them — from a key + scale.
```

- [ ] **Step 2: Full verification pass**

Run: `npm test` — expected: PASS.
Run: `npm run build` — expected: clean.
Run: `npm run dev` and exercise the whole flow once: generate (auto), play, stop, uncheck auto, pick a preset, generate, restore a history row, download both MIDI files.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: README reflects generated chords"
```
