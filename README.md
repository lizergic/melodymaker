# MelodyMaker

Generate harmonically-aware melodies from a key + scale and a chord progression.
Audition in-browser, re-roll, and export MIDI. Fully client-side; no backend.

**Live:** https://melodymaker.lizergic.dev

## Develop

    npm install
    npm run dev      # local dev server
    npm test         # unit tests (engine, theory, rng, midi, history)
    npm run build    # production build -> dist/

## Deploy (Cloudflare)

Git-connected to Cloudflare; pushes to `master` auto-deploy. It builds with
`npm run build` and ships `dist/` as static assets (`wrangler.jsonc`, no Worker
script). `.node-version` pins Node 22 for the build (Vite 8's floor).

`public/_headers` ships a strict Content-Security-Policy. If browser audio ever
fails to start behind the CSP, relax `worker-src` (Tone.js may use a blob
AudioWorklet) — it already includes `blob:`.

## Roadmap (deferred)

- ML-assisted generation (Cloudflare Workers AI at the edge, or client-side).
- Multiple melody tracks, humanization, swing.

## License

MIT — see [LICENSE](LICENSE).
