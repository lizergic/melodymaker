# Chord Generation — Design

**Date:** 2026-07-06
**Status:** Approved

## Goal

Chords are generated from the chosen key/scale instead of typed by the user. Generated chords are visible in the piano roll as translucent bars below the melody. The chord text input stays as an optional override.

## Approach

Curated Roman-numeral progression pool with per-generation triad/7th flavoring (approach A + C's coin-flip). A weighted random walk (approach B) was considered and rejected for v1 — more code, occasionally limp output. Upgrade path if the pool feels repetitive.

## Components

### 1. `src/progressions.ts` (new)

- A small pool of progressions expressed as scale degrees (0-indexed into the scale), e.g. `[0, 4, 5, 3]` for I–V–vi–IV. Include major-leaning and minor-leaning entries; pick candidates compatible with the scale's chord qualities rather than hardcoding major/minor pools.
- `generateChords(key: string, scale: string, seed: number): string[]` —
  - Seeded RNG (existing `mulberry32`).
  - Picks a progression from the pool.
  - Builds each chord diatonically: stack scale thirds (degrees d, d+2, d+4 mod 7) and name the notes via tonal's `Chord.detect`, taking the first detected symbol. Coin-flip per *generation* (not per chord): triads vs 7ths (stack d+6 too).
  - If `Chord.detect` returns nothing for a 7th stack, fall back to that degree's triad; a diatonic triad always detects (maj/min/dim/aug).
  - Returns chord symbols compatible with `Chord.get` (they feed the existing pipeline untouched).
- Scales with fewer than 7 notes (pentatonics, blues) generate from their parent heptatonic instead: major pentatonic → major, minor pentatonic and blues → aeolian. The melody still uses the selected scale; only chord construction borrows the parent. Must never return an empty list or symbols that fail `isValidChord`.

### 2. Engine / audio / MIDI / history — unchanged

`GenInput.chords: string[]` stays. All consumers (engine strong-beat chord tones, audio block chords, MIDI chord track, history) already take chord symbols and are untouched.

### 3. UI (`main.ts`, `index.html`)

- Chord row gains an `auto` checkbox, **default on**.
  - Checked: chord input + preset select disabled. On Generate, chords come from `generateChords(key, scale, seed)`; the resulting symbols are written into the (disabled) input so the user sees the progression.
  - Unchecked: exactly today's behavior (typed chords / presets, validation).
- `validate()`: in auto mode, always valid (no chord parsing needed); Generate never disabled by the chord field.
- `readInput(seed)`: if auto, `chords = generateChords(key, scale, seed)`; else `parseChords()`.
- History entries store the resolved chord symbols (as today), so restore replays the exact progression regardless of mode.

### 4. Roll rendering (`main.ts` renderRoll, `styles.css`)

- Chord tones drawn as bars at their actual played pitches (`48 + pc`, matching audio/MIDI), one bar per chord tone per chord span.
- Roll lane range extends down to 48: chord pitches are `48 + pc` (pc 0–11), so lanes span 48..76 (29 rows vs 19 today; rows are %-height so the roll just gets denser).
- Chord bars styled distinctly: low opacity (~0.25–0.35), different hue from melody notes, no glow, behind melody notes in z-order. They do not participate in playhead "lit" highlighting.
- `rollmeta` line unchanged (already shows chord count).

## Determinism

Same seed → same chords and same melody. `generateChords` uses its own `mulberry32(seed)` instance so the melody RNG stream is unaffected by chord generation.

## Error handling

- Auto mode: `generateChords` output is validated with `isValidChord`; any unnameable chord falls back to its triad. Empty result is impossible by construction (pool is static, triads always name).
- Manual mode: existing validation UX unchanged.

## Testing

One small runnable check (per repo convention): assert that for every (key × all 12 scales × a few seeds), `generateChords` returns ≥2 symbols, all passing `isValidChord`, and is deterministic for the same seed. Vitest if present, else a plain assert script.

## Out of scope

Random-walk progression generation, per-chord flavoring, chord inversions/voicings, roll interaction with chord bars.
