# Parallax

Parallax is an advisor-led retirement decision simulator. One protected engine
shows how client choices behave across simulated and real historical market
paths.

`PRINCIPLES.md` is the active doctrine. If anything in this repo — including
this file — conflicts with it, `PRINCIPLES.md` wins.

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

- `engine.js` — the financial engine. The only source of financial truth.
  Do not change engine math without explicit agreement and tests.
- `engine.test.js` — Node test suite guarding the engine. Runs in CI on every
  push (`.github/workflows/test.yml`).
- `index.html` — the current app prototype. UI only: it imports the engine
  from `engine.js` as an ES module, so the page must be served over HTTP
  (as `scripts/verify.mjs` and GitHub Pages both do) rather than opened
  via `file://`.
- `scripts/verify.mjs` — visual verification: runs the full `npm test` suite, serves
  the repo, drives headless Chromium through `index.html`, and writes
  screenshots to `verify-out/`. Requires Chrome (or `npx puppeteer browsers install chrome`).
- `assets/` — the logo.
- `PRINCIPLES.md` — doctrine.

## Commands

```bash
npm ci                    # install dev dependencies (puppeteer)
npm test                  # engine tests
node scripts/verify.mjs   # visual verification + screenshots
```

## Shipping

GitHub Pages serves `main` from the repository root; `index.html` is the live
entry file. Run `npm test` before trusting model changes and
`node scripts/verify.mjs` before claiming UI work is complete.
