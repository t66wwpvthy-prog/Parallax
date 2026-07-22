# Parallax

Parallax is an advisor-led retirement decision simulator. One protected engine
shows how client choices behave across simulated and real historical market
paths.

`PRINCIPLES.md` is the active doctrine. If anything in this repo — including
this file — conflicts with it, `PRINCIPLES.md` wins.

## Product Spine

Five tabs form one planning path; Cash Flow is detail inside Scenarios:

- Household: collect household, asset, income, expense, liability, and assumption facts.
- Goals: collect and edit the client goals used by the plan.
- Scenarios: compare planning choices on the same market paths and inspect the
  year-by-year Cash Flow ledger that proves where each result came from.
- Tax Buckets: show the account-tax composition and planning facts used by the
  tax-aware analysis.
- Sequencing: run the same plan through real markets such as 1966, 1973, 2000,
  and 2008.

Nothing else belongs unless it exposes engine truth or helps an advisor explain
a client decision.

## Repository Layout

- `engine.js` — the simulation engine and source of wealth/path/bucket truth.
  Do not change engine math without explicit agreement and tests.
- `src/tax/` — isolated federal tax-law truth. It never imports `engine.js`.
- `engine.test.js` — Node test suite guarding the engine. Runs in CI on every
  push (`.github/workflows/test.yml`).
- `index.html` — app markup and stylesheet links. Loads `src/main.js` as the sole ES module
  entry; must be served over HTTP (as `scripts/verify.mjs` and GitHub Pages do),
  not opened via `file://`.
- `src/main.js` — UI boot, orchestration (`runAll`), and wiring to `engine.js`.
- `src/state.js` — mutable UI state (scenarios, replay, solver flags).
- `ui/*.js` — view modules (household, goals, scenarios, cashflow, sequencing, etc.).
- `scripts/verify.mjs` — visual verification: runs the full `npm test` suite, serves
  the repo, drives headless Chromium through `index.html`, and writes
  screenshots to `verify-out/`. Requires Chrome (or `npx puppeteer browsers install chrome`).
- `assets/` — the logo.
- `PRINCIPLES.md` — doctrine.
- `docs/ARCHITECTURE.md` — **where code goes; anti-monolith rules; all agents read this.**

## Commands

```bash
npm ci                    # install dev dependencies (puppeteer)
npm test                  # complete declared Node test suite
node scripts/verify.mjs   # visual verification + screenshots
```

## Shipping

GitHub Pages serves `main` from the repository root; `index.html` is the live
entry file. Run `npm test` before trusting model changes and
`node scripts/verify.mjs` before claiming UI work is complete.
