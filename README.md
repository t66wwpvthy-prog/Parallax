# Parallax

Parallax is an advisor-led retirement decision simulator. It uses one protected
engine to show how client choices behave across simulated and real historical
market paths.

## Product Spine

Parallax should stay centered on four surfaces:

- Household / Plan inputs: household, assets, income, expenses, goals,
  liabilities, and assumptions.
- Scenarios: compare planning choices on the same market paths so differences
  come from the decision, not simulation noise.
- Sequencing: run the same plan through real markets such as 1966, 1973, 2000,
  and 2008.
- Cash-flow detail: the year-by-year ledger that proves where the result came
  from.

Anything else is secondary unless it directly exposes engine truth or helps an
advisor explain a client decision.

## Protected Core

`engine.js` is the source of truth. Do not casually change engine math.

The engine currently supports real-return Monte Carlo, block-sampled return
paths, same-path scenario comparison, taxable / traditional / Roth sleeves,
basis tracking, withdrawal sequencing, RMDs, pension timing, timed goals and
expenses, liabilities, property mortgage handling, override-based asset sales,
and historical sequencing.

Engine changes require explicit agreement and tests.

## Repository Layout

- `engine.js`: financial engine and simulation logic.
- `engine.test.js`: Node test suite for engine behavior.
  `parallax.html`.
- `scripts/verify.mjs`: builds, tests, serves, drives Chromium, and captures
  verification screenshots.
  `PRINCIPLES.md`: current project truth.
- `archive/`: old notes, handoffs, idea documents, and static demos that should
  not drive new work.
- `docs/positioning/`: product explanation, pitch, and prior-art materials.

## Common Commands

```bash
npm ci
npm test
node build-standalone.mjs
node scripts/verify.mjs
```

`node scripts/verify.mjs` is the strongest local check. It rebuilds standalone
files, runs the engine tests, opens the app in headless Chromium, exercises the
main screens, and writes screenshots to `verify-out/`.

## Shipping Notes

GitHub Pages serves `main` from the root. , rebuild with `node build-standalone.mjs` and commit the regenerated
`index.html` and `parallax.html` with the source change.

Run engine tests before trusting model changes. Run visual verification before
claiming UI work is complete.
