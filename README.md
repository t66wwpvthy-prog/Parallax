# Parallax

Parallax is a browser-based retirement planning prototype for comparing a
baseline plan against scenario columns. It combines an engine-backed Monte Carlo
model with advisor-facing UI surfaces for net worth, cash flow, goals,
scenarios, sequencing risk, and annual cash-flow detail.

## Repository Layout

- `parallax_v2.html` - source UI shell.
- `engine.js` - financial engine and simulation logic.
- `engine.test.js` - Node test suite for engine behavior.
- `build-standalone.mjs` - inlines the engine into standalone `index.html` and
  `parallax.html`.
- `scripts/verify.mjs` - builds, tests, serves, drives Chromium, and captures
  verification screenshots.
- `aurora/`, `reference/`, and document assets - design references, prototypes,
  and supporting material.

## Common Commands

```bash
npm ci
node --test engine.test.js
node build-standalone.mjs
node scripts/verify.mjs
```

`node scripts/verify.mjs` is the strongest local check. It rebuilds the
standalone files, runs the engine tests, opens the app in headless Chromium,
exercises the main screens, and writes screenshots to `verify-out/`.

## Shipping Notes

GitHub Pages serves `main` from the generated standalone files. After changing
`parallax_v2.html` or `engine.js`, rebuild with `node build-standalone.mjs` and
commit the regenerated `index.html` and `parallax.html` with the source change.

Run the engine tests before trusting model changes, and run the visual verifier
before claiming UI work is complete.
