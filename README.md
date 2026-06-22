# Parallax

Parallax is an advisor-led retirement decision simulator. One protected engine
shows how client choices behave across simulated and real historical market
paths.

`PRINCIPLES.md` is the active doctrine. If anything in this repo conflicts with
it, `PRINCIPLES.md` wins.

## Canonical App

- `index.html` is the live Parallax front end. In Phase A it is the
  liquid-glass UI port from `DESIGN REF UPDATED/parallax-liquid-glass-merged.html`.
- `archive/legacy-monolith.html` is the frozen legacy monolith. It is reference
  only and is not the product surface.
- `engine.js` remains the financial truth. The Phase A liquid-glass UI is not
  wired to `engine.js` yet.
- `src/tax/` remains isolated tax-engine work. It is not part of this UI PR.

Phase A keeps the mock cash-flow and scenario numbers visible so the UI can be
reviewed. Do not treat those numbers as financial outputs until the Phase B
engine wire lands.

## Product Spine

Four surfaces, nothing else unless it exposes engine truth or helps an advisor
explain a client decision:

- Household / Plan inputs: household, assets, income, expenses, goals,
  liabilities, assumptions.
- Scenarios: compare planning choices on the same market paths, so differences
  come from the decision, not simulation noise.
- Sequencing: run the same plan through real markets such as 1966, 1973, 2000,
  and 2008.
- Cash-flow detail: the year-by-year ledger that proves where the result came
  from.

## Repository Layout

- `index.html` - canonical liquid-glass Phase A UI served by GitHub Pages.
- `archive/legacy-monolith.html` - frozen old engine-wired monolith, reference
  only.
- `engine.js` - the financial engine. Do not change engine math without
  explicit agreement and tests.
- `engine.test.js` - Node test suite guarding the engine.
- `history.js` - cross-era reference analytics for the History tab.
- `scripts/preview.mjs` - local static preview for root `index.html`.
- `scripts/verify.mjs` - visual smoke verification for the canonical UI.
- `assets/` - the logo.
- `src/tax/` - isolated tax engine work, not wired into the UI yet.
- `PRINCIPLES.md` - doctrine.

## Commands

```bash
npm ci
npm test
npm run preview
node scripts/verify.mjs
```

## Shipping

GitHub Pages serves `main` from the repository root. The live page is
`index.html`. Run `npm test` before trusting model changes and
`node scripts/verify.mjs` before claiming UI work is complete.
