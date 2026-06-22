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
