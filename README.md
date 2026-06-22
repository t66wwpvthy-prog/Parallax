# Parallax

Parallax is an advisor-led retirement decision simulator. One protected engine
shows how client choices behave across simulated and real historical market
paths.

`PRINCIPLES.md` is the active doctrine. If anything in this repo conflicts with
it, `PRINCIPLES.md` wins.

## Canonical App (live site)

| Path | Role |
|------|------|
| **`parallax.html`** | **Live app** — liquid-glass Phase A UI |
| `index.html` | Redirect stub for GitHub Pages only (not the app) |
| `archive/legacy-monolith.html` | Frozen old monolith — **never linked, never previewed** |
| `engine.js` | Financial engine (not wired to Phase A UI yet) |
| `src/tax/` | Tax engine (CLI only) |

Open the app: `npm run preview` → http://127.0.0.1:8825/parallax.html

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

- `parallax.html` - canonical liquid-glass Phase A UI.
- `index.html` - GitHub Pages redirect stub only (not the app).
- `archive/legacy-monolith.html` - frozen old engine-wired monolith, reference only.
- `engine.js` - the financial engine. Do not change engine math without
  explicit agreement and tests.
- `engine.test.js` - Node test suite guarding the engine.
- `history.js` - cross-era reference analytics for the History tab.
- `scripts/preview.mjs` - local static preview; opens `parallax.html`.
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

GitHub Pages serves `main` from the repository root. Visitors hit `/` →
`index.html` (redirect) → **`parallax.html`** (the app). The legacy monolith is
in `archive/` only.

```bash
npm test
npm run preview    # → http://127.0.0.1:8825/parallax.html
node scripts/verify.mjs
```
