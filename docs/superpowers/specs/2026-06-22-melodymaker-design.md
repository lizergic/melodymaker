# MelodyMaker — Design Spec

**Date:** 2026-06-22
**Status:** Approved, pre-implementation

## Purpose

A static web app that generates harmonically-aware melodies. The user picks a
key + scale and a chord progression; the app writes a complete melody that
targets chord tones on strong beats and uses scale tones as passing motion,
lets the user audition it, re-roll for variations, and download the result as a
standard MIDI file.

Built on a whim — scope is deliberately small. The generation engine is the
valuable part; everything else is a thin shell around it.

## Non-goals (v1)

- No live MIDI-out to a DAW (MIDI file export is sufficient).
- No user accounts, no server-side persistence, no database.
- No backend at all in v1 — fully client-side.

## Deferred (kept in mind, not built)

- **ML-driven generation** — the deployment venue is chosen to accommodate this
  later (see Deployment). The engine boundary (below) is designed so an ML
  generator can be swapped/added without touching the UI.
- Multiple melody tracks, humanization, swing.

## Architecture

Single-page static app. Three layers, one-way dependency (UI → engine, UI →
audio/export; engine depends on nothing app-specific):

```
  ┌──────────────────────────────────────────────┐
  │ UI (index.html + main.ts)                      │
  │  key/scale/chords/bars/tempo · Generate ·      │
  │  Play/Stop · Download · history · piano-roll   │
  └───────┬───────────────┬───────────────┬────────┘
          │               │               │
   ┌──────▼─────┐  ┌──────▼──────┐  ┌─────▼──────┐
   │  engine.ts │  │  audio.ts   │  │  midi.ts   │
   │ (pure TS)  │  │ (Tone.js)   │  │(@tonejs/   │
   │ generate() │  │ play/stop   │  │  midi)     │
   └──────┬─────┘  └─────────────┘  └────────────┘
          │
   ┌──────▼─────┐
   │ tonal      │  scales, chord-symbol parsing, note math
   └────────────┘
```

### `engine.ts` — the creative core (pure, no DOM/audio deps)

Single entry point:

```ts
generate(input: GenInput): Melody
```

```ts
type GenInput = {
  key: string            // e.g. "C", "F#"
  scale: string          // tonal scale name, e.g. "major", "dorian"
  chords: string[]       // e.g. ["Cmaj7", "Am7", "Dm7", "G7"]
  bars: number           // total bars
  beatsPerBar: number    // default 4
  tempo: number          // BPM (carried through for playback/export)
  seed: number           // deterministic RNG seed
}

type Note = { midi: number; startBeat: number; durBeats: number; velocity: number }
type Melody = { notes: Note[]; input: GenInput }   // input echoed for reproducibility
```

**Algorithm (deterministic given seed):**
1. Distribute chords across bars (even split; remainder front-loaded).
2. For each beat, pick a rhythm cell from a small weighted pattern library
   (e.g. quarter, two-eighths, dotted-eighth+sixteenth, rest).
3. **Strong beats (beat 1, 3) → chord tones**, biased toward 3rd/7th for color
   over root/5th.
4. **Weak/passing positions → scale tones** chosen to connect the surrounding
   chord tones by stepwise voice-leading.
5. **Contour**: random walk biased to steps; occasional leaps that must land on
   a chord tone; register clamped to ~1.5 octaves around a center.
6. Assign velocities (slight strong/weak-beat accent).

**RNG**: small seeded PRNG (e.g. mulberry32) so re-roll varies and a liked
melody is reproducible from its seed. No `Math.random` in the engine.

**ML hook (deferred):** the same `Melody` shape can be produced by a future
`generateML(input)`; UI calls one or the other. No other layer changes.

### `audio.ts` — playback (Tone.js)

`play(melody, { withChords })` schedules notes (and optionally the chords) on a
Tone.js synth via Transport at `melody.input.tempo`; `stop()` halts. No state
beyond the current Tone transport.

### `midi.ts` — export (@tonejs/midi)

`toMidiBlob(melody, { withChords })` builds a `.mid` (melody track, optional
chord track) and returns a Blob for download. Filename encodes key/scale/seed.

### `main.ts` — UI + glue

Controls: key dropdown, scale dropdown, chord text field (+ a few preset
progressions), bars, tempo, Generate, Play/Stop, Download MIDI. A small
canvas piano-roll renders `Melody.notes`.

## Scales (v1)

Major (Ionian), Dorian, Phrygian, Lydian, Mixolydian, Aeolian (natural minor),
Locrian, harmonic minor, melodic minor, major pentatonic, minor pentatonic,
blues. (All resolvable via tonal.)

## Chord input

Free-text field, space-separated chord symbols parsed by tonal
(`Cmaj7 Am7 Dm7 G7`). A dropdown of ~4 preset progressions fills the field.
Invalid symbols are flagged inline; Generate is disabled until all parse.

## Persistence — local, seed-based

`localStorage` ring buffer of the **last 10 generations**, storing only
`GenInput` (incl. seed) — not note blobs, since the seed reproduces the melody
deterministically. History list lets the user re-load (→ re-audition or
re-download) any of the last 10. Guards against accidental Generate clicks.
The downloaded `.mid` is the real "save."

## Deployment

**Cloudflare Pages** (static build, git-connected, free, HTTPS, global CDN).
Chosen over Vercel specifically so deferred ML can use **Workers AI** at the
edge on the same platform/free tier without new infra. If ML ends up
client-side instead, Pages still serves it unchanged.

## Security

Static app → minimal attack surface (no server/DB/auth/secrets in v1).
- Pinned dependency versions; periodic `npm audit`.
- Strict Content-Security-Policy via a Pages `_headers` file.
- HTTPS automatic on Pages.
- *When a Worker is added for ML:* validate all input and rate-limit the
  endpoint. (Out of scope until then.)

## Stack

- **tonal** — scales / chord-symbol parsing / note math (not reinvented).
- **Tone.js** — playback scheduling.
- **@tonejs/midi** — MIDI file export.
- **Vite + vanilla TypeScript**, single page. No UI framework.

## Testing

`engine.ts` is pure → unit-testable without a browser. Minimum checks:
- Every strong-beat note is a chord tone of the active chord.
- Every note is in the selected key+scale (or a chord tone).
- Same seed → identical melody (determinism).
- Notes stay within the register bound.
- Chord parsing rejects garbage input.

(Vitest — lightweight, ships with Vite. No heavy fixtures.)
