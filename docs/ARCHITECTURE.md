# Parallax Architecture

**Authority:** `PRINCIPLES.md` wins on product doctrine. This file wins on **repo layout and where code goes**.

**Goal:** No new monoliths. `index.html` and `src/main.js` stay thin; truth lives in focused modules.

---

## Site shape (static ES modules, no bundler)

```
index.html          markup + CSS links + <script type="module" src="src/main.js">
src/main.js         boot + runAll + listeners (SHRINK — target ~200–400 lines)
src/state.js        mutable UI state + localStorage side effects (no render, no DOM)
ui/*.js             views: HTML/SVG generation, display helpers (no financial math)
src/planning/       glue between engine and tax (adapters, attach, multi-year)
src/tax/            federal Form 1040 math only (never imports engine.js)
engine.js           simulation truth only (wealth, paths, withdrawals, buckets)
styles/*.css        presentation per surface
scripts/verify.mjs  tests + browser smoke; scans index.html + src/**/*.js + ui/**/*.js
```

**Product spine (tabs):** Household → Goals → Scenarios → Tax Buckets → Sequencing (Cash Flow lives inside Scenarios).

---

## Layer rules (non-negotiable)

| Layer | Owns | Must NOT |
|-------|------|----------|
| `engine.js` | Simulation numbers, success rate, bucket balances when built | Federal tax rules, DOM, localStorage |
| `src/tax/` | Federal 1040 rules, composers, intake | `engine.js` import, DOM |
| `src/planning/tax/` | Reshape engine rows → tax input; attach summaries to analysis | Tax rule math, UI HTML |
| `src/state.js` | scenarios, replay, solver flags, ScenariosUI state | Render functions, DOM |
| `ui/*` | Render HTML/SVG; pure formatters/charts | Engine math, tax math, mutation gateways |
| `src/main.js` | Boot, tab wiring, `runAll`, call into modules | New feature logic (extract instead) |
| `index.html` | Structure, IDs, `data-page`, mount points | JavaScript (except the single main.js script tag) |

---

## Where new work goes (decision tree)

```
New work?
├─ Changes projected wealth / success rate / buckets?  → engine.js + engine.test.js
├─ Changes federal tax on a return?                    → src/tax/federal/rules/<rule>.js + test
├─ Connects engine rows to tax?                        → src/tax/adapters/ or src/planning/tax/
├─ Changes what the advisor sees?                      → ui/<surface>.js (+ styles/*.css)
├─ UI flags / scenarios / replay state?              → src/state.js
├─ Household DB / wizard / commit cascade?             → src/household/* (preferred) or extract from main.js
├─ Scenario levers / reseed / sharedPaths?           → src/scenarios/* (preferred)
└─ HTML skeleton / new mount IDs?                    → index.html (rare)
```

---

## Anti-monolith rules

1. **Never add app logic to `index.html`.** One script tag only.
2. **If a feature adds ~50+ lines to `src/main.js`, extract a module in the same PR.**
3. **One tax rule = one file** in `src/tax/federal/rules/` + colocated test + `rulesLedger.js` entry.
4. **One screen = one `ui/<surface>.js`** (+ scoped CSS). Do not create `ui/misc.js` dumping grounds.
5. **Move, don't copy.** Import existing `ui/formatters.js`, `ui/charts.js`, `ui/dom.js` — no duplicates.
6. **No new `package.json` dependencies** unless explicitly agreed.
7. **`engine.js` may stay large** — it is the single simulation truth module, test-guarded. That is not the same problem as a UI monolith.

---

## Target structure (grow into this; no big-bang rewrite)

```
src/
  main.js                 # thin entry (shrink over time)
  state.js
  household/              # extract from main.js when touched
    persistence.js        # load/save households, hydrate
    wizard.js             # renderWiz*, hhField, syncHousehold
    commit.js             # hhCommit, commitPlanEdit
  scenarios/              # extract from main.js when touched
    levers.js             # LEVCFG, leversToOverrides, planForScenario
    engine-bridge.js      # reseedScenarios, ensureSharedPaths, runAll helpers
ui/
  config/                 # static tables (LEVCFG, goal palettes) when extracted
  household.js, goals.js, scenarios.js, solver.js, cashflow.js, sequencing.js, ...
```

Extract **when you touch an area**, not as a standalone refactor sprint.

---

## Verification

| Change | Run |
|--------|-----|
| `engine.js` | `npm test` |
| `src/tax/*` | `npm test` |
| `ui/*`, `src/main.js`, `index.html` markup | `npm test` + `node scripts/verify.mjs` |
| Docs only | neither |

`verify.mjs`: HTML structure checks scan `index.html` only; JS symbol checks scan `index.html` + `src/**/*.js` + `ui/**/*.js`.

---

## Current structural debt (not a roadmap)

- UI modularization has landed. Do not revive its old branch plan or move logic back into `index.html`.
- `src/main.js` remains larger than the target. Continue extracting bounded seams only when that area is touched and browser-verified; do not start a big-bang rewrite.
- Existing Household seams include `src/household/persistence.js`, `commit.js`, and `wizard.js`. Reuse them before creating another controller layer.
- Tax work must follow current code, tests, and the real↔nominal contract. Dated phase handoffs are provenance, not active branch or worktree instructions.
- Historical branches, mockups, QA notes, and backlog entries do not change layer ownership.

The decision to replace engine `row.taxes` with federal tax or keep a parallel comparison remains a product/modeling decision. Real↔nominal tax bridge: see `docs/tax/real-vs-nominal-tax-contract.md`.

---

## Agent entry point

`AGENTS.md` is the single agent entry point. Do not maintain copy/paste session prompts or active branch instructions in architecture documents.
