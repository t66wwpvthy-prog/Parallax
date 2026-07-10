# Tax + planning handoff

**Updated:** 2026-07-10 (post-modularization)  
**Branch:** `main`  
**Tests:** 156 passing (`npm test`)  
**UI entry:** `index.html` (markup) → `src/main.js` (wiring)  
**Visual gate:** `node scripts/verify.mjs` (runs full test suite + headless UI smoke)

---

## Plain summary

Separate **federal Form 1040–style tax** (`src/tax/`) sits beside the planner (`engine.js`). The planner still uses its **rough tax shortcut** on each simulation row (`row.taxes`). The tax module is real 1040 plumbing: intake → validate → calculate → stable result object.

**Typical path compare is live in the UI:** after Scenarios Run, `attachTypicalPathFederalTax` runs on the median path and Scenarios shows **engine tax vs federal tax** (retirement years only). Planner numbers are not rewritten.

**Future shape:** planner cash flows → adapter → tax box → compare or display. Full federal replacement inside the planner is a separate decision.

---

## What is done (verified on `main`)

| Area | Status |
|------|--------|
| Stable module `src/tax/annual1040.js` | ✅ |
| Line-for-line 1040 intake + validation | ✅ |
| 2025 + 2026 law tables | ✅ |
| Engine-year adapter + `runEngineYearTax` | ✅ |
| Multi-year `runTaxForScenarioPath` | ✅ |
| Planning attach `attachTypicalPathFederalTax` | ✅ merged |
| **UI:** tax compare row after Run (`scn-tax`, `renderTaxCompare`) | ✅ merged (PR #49) |
| `engine.js` | ❌ not modified (doctrine) |
| NIIT / AMT / full credits | ❌ intentional gaps |

### Typical desk-return benchmark (2025, itemized)

Fixture: `src/tax/tests/fixtures/engine-year/demo-wages.json`  
Parallax line 24 ≈ **$55,493** vs client **$56,815** (~$1,322 gap). Expected until NIIT/AMT/credits/line 3a etc. are added.

---

## Planning attach (typical path)

| File | Role |
|------|------|
| `src/planning/tax/buildPlanMetaFromEngineParams.js` | Planner settings → adapter input |
| `src/planning/tax/attachTypicalPathFederalTax.js` | `analysis.paths.p50` retirement rows → slim summary |
| `src/planning/tax/attachTypicalPathFederalTax.test.js` | Tests (imports `engine.js` in tests only — OK) |

Wired in `src/main.js` inside `runAll()` after each scenario simulation:

```js
s.res.typicalPathFederalTax = attachTypicalPathFederalTax(s.res, { planMeta, filingStatus, ... });
```

### `totals` meaning

| Field | Meaning |
|-------|---------|
| `federalTaxLiability` | Sum of **new** federal tax on **retirement rows only** |
| `enginePathTax` | Sum of **`row.taxes`** on those **same** rows |
| `engineLifetimeTax` | Original **`paths.p50.lifetimeTax`** (all years, full path) |

Fair compare: **`deltaVsEnginePath`**.  
Looser compare: **`deltaVsEngineLifetime`**.

Accumulation rows are **skipped**.

---

## Verification

```powershell
cd C:\Dev\Parallax
npm test
node scripts/verify.mjs
```

- **Tests:** engine, history, tax rules, fixtures, planning attach (156 today).
- **Verify:** full test preamble + Chromium smoke of Household (map + net worth), Goals, Scenarios, Cash Flow mode, Sequencing, History. Screenshots → `verify-out/`.
- **Chrome:** verify auto-detects system Chrome on Windows/macOS/Linux, or set `PUPPETEER_EXECUTABLE_PATH`.

---

## Architecture (doctrine)

- **Rules** calculate law. **Composers** combine rules. **Adapters** reshape data only.
- Tax modules **must not** import `engine.js` (enforced by test).
- **Planning layer** may call both engine and tax.
- Do **not** put tax math inside `engine.js`.
- Do **not** tax all Monte Carlo sims until typical path is trusted.

Docs: `docs/TaxEngineArchitecture.md`, `docs/TaxEngineEngineJsBoundary.md`, `docs/tax/1040-basic-line-map.md`, `PRINCIPLES.md`

---

## Known gaps (intentional)

- NIIT, AMT, full credits, Schedule D ST/LT split — not modeled (or pass-through only)
- SS: engine uses flat 85%; tax module uses worksheet — expect mismatch
- Calendar `taxYear` on long paths: clamped to last supported law year (2026 today)
- Phase 3 spine: standard deduction rule, credits lines 17–23, SS↔IRA iteration

---

## Next product/engine work (not tax-doc drift)

Pick one when ready — not tracked in this file day-to-day:

- Survivor Social Security on death
- LTC cost escalation over time
- Duplicate scenario column
- Solve-for solo vs combined display clarity
- Expand federal tax rules where UI gap proves need

---

## Quick file map

```
src/tax/annual1040.js              ← stable public tax module
src/planning/tax/                  ← multi-year + typical-path attach
engine.js                          ← planner (unchanged)
index.html                         ← markup + CSS links
src/main.js                        ← boot; imports attach + shows tax compare
scripts/verify.mjs                 ← tests + visual smoke
ui/formatters.js, ui/charts.js     ← extracted display helpers
```
