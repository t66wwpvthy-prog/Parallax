# Tax + planning handoff (new chat)

**Updated:** 2026-06-22  
**Branch:** `main` (PR #47 squash-merged: *tax: add stable annual 1040 contract and isolated engine-year adapter*)  
**Tests:** 166 passing (`npm test`) — run after pulling latest  

**Local note:** `attachTypicalPathFederalTax` (typical-path compare hook) is implemented but **not committed yet** on this machine. See §Planning attach below.

---

## Plain summary

We built a **separate federal tax calculator** (Form 1040–style) that does **not** run on the website yet. The site still uses the planner’s **rough tax shortcut** (flat % on withdrawals).

The tax work is **backend plumbing**: intake → validate → calculate → a stable result object. The planner (`engine.js`) is **unchanged**.

**Future shape:** planner produces cash flows → adapter → tax box → compare or display. UI comes last.

---

## What is done and merged

| Area | Status |
|------|--------|
| Stable module `src/tax/annual1040.js` | ✅ `validateClient1040Intake` → `runClient1040Intake` → `annual1040Result` |
| Line-for-line 1040 intake | ✅ `client1040Intake.js`, validation, intake report |
| 2025 + 2026 law tables | ✅ `2025_FINAL`, `2026_FINAL` via `lawRegistry.js` |
| Engine-year adapter | ✅ `engineYearTo1040Input.js`, `runEngineYearTax` |
| Multi-year wrapper | ✅ `runTaxForScenarioPath.js` |
| CLI try-it-yourself | ✅ `node scripts/tax-engine-year.mjs demo-wages` |
| Fixtures + regression | ✅ 7 annual fixtures, demo-wages regression, marginal-rate tests |
| `engine.js` | ❌ not modified |
| Website / UI | ❌ not modified |

### Typical desk-return benchmark (2025, itemized)

Fixture: `src/tax/tests/fixtures/engine-year/demo-wages.json`  
Parallax line 24 ≈ **$55,493** vs client **$56,815** (~$1,322 gap). Expected until NIIT/AMT/credits/line 3a etc. are added.

---

## Planning attach (typical path) — local, not merged

**Purpose:** After a scenario run, run the **median story path only** through the real tax box and **compare** — without changing planner numbers.

| File | Role |
|------|------|
| `src/planning/tax/buildPlanMetaFromEngineParams.js` | Planner settings → adapter input |
| `src/planning/tax/attachTypicalPathFederalTax.js` | `analysis.paths.p50` retirement rows → slim summary |
| `src/planning/tax/attachTypicalPathFederalTax.test.js` | Tests (imports `engine.js` in tests only — OK) |

**Not wired:** nothing calls this after `runSimulation` in `index.html` yet.

### `totals` meaning (important)

| Field | Meaning |
|-------|---------|
| `federalTaxLiability` | Sum of **new** federal tax on **retirement rows only** |
| `enginePathTax` | Sum of **`row.taxes`** on those **same** rows |
| `engineLifetimeTax` | Original **`paths.p50.lifetimeTax`** (all years, full path) |

Fair compare: **`deltaVsEnginePath`**.  
Looser compare: **`deltaVsEngineLifetime`** (federal retirement sum vs engine whole-life number).

Accumulation rows are **skipped**.

---

## How to try it (terminal)

PowerShell may block `npm`; use `node` directly:

```powershell
cd C:\Dev\Parallax
node scripts/tax-engine-year.mjs demo-wages
node scripts/tax-intake.mjs annual-07-mfj-itemized-mock
npm test
```

Edit demo input: `src/tax/tests/fixtures/engine-year/demo-wages.json`

Personal mock (optional, not in repo): `my-mock-return.json` at repo root for manual runs only.

---

## Architecture (doctrine)

- **Rules** calculate law. **Composers** combine rules. **Adapters** reshape data only.
- Tax modules **must not** import `engine.js` (enforced by test).
- **Planning layer** may call both engine and tax; it sits between them.
- Do **not** put tax math inside `engine.js`.
- Do **not** tax all Monte Carlo sims until typical path is trusted.

Docs: `docs/TaxEngineArchitecture.md`, `docs/TaxEngineEngineJsBoundary.md`, `docs/tax/1040-basic-line-map.md`

---

## Public entry points

```js
// One year, client-shaped intake
import { runClient1040Intake, buildDefaultTaxContext } from './src/tax/annual1040.js';

// Engine-shaped year
import { runEngineYearTax, engineYearTo1040Input } from './src/tax/annual1040.js';

// Many years on a row array
import { runTaxForScenarioPath } from './src/planning/tax/runTaxForScenarioPath.js';

// Typical path compare (after runSimulation)
import { attachTypicalPathFederalTax } from './src/planning/tax/attachTypicalPathFederalTax.js';
```

---

## Known gaps (intentional)

- NIIT, AMT, full credits, Schedule D ST/LT split — not modeled (or pass-through only)
- SS: engine uses flat 85%; tax module uses worksheet — expect mismatch
- Calendar `taxYear` on long paths: clamped to last supported law year (2026 today)
- Client line 24 reconciliation deferred until optional 1040 detail added to fixtures

---

## Next steps (recommended order)

1. **Commit** planning attach files + `package.json` test entry (if not already on remote).
2. **Wire after Run** — call `attachTypicalPathFederalTax(analysis)` when scenario completes; stash on result; **no UI yet**.
3. **Close mock gap** — add line 3a / lines 17–23 when 1040 is available.
4. **Add tax rules** only where gap proves they’re needed.
5. **Small UI** — show planner tax vs federal tax on typical path.
6. **Later** — other paths, or planner uses federal tax (big decision).

---

## UI / other work (parked)

- Household glass UI: stashed on `feat/parallax-ui-phase-a` (not current focus).
- GitHub Pages demo / scenario rendering / cash-flow drawer: **do not change** in tax PRs unless explicitly requested.

---

## User prefs for new chat

- Explain in **plain language** what we’re building and **why it’s shaped for the future**.
- User trusts agent on **code**; needs **conceptual** sanity checks, not file dumps.
- Keep replies **short** unless asked for detail.

---

## Quick file map

```
src/tax/annual1040.js              ← stable public module
src/tax/adapters/                  ← intake + engineYearTo1040Input
src/tax/core/lawRegistry.js        ← taxYear → law version
src/planning/tax/                  ← multi-year + typical-path attach
scripts/tax-engine-year.mjs        ← CLI demo
src/tax/tests/fixtures/annual/     ← committed mock returns
src/tax/tests/fixtures/engine-year/
engine.js                          ← planner (unchanged)
index.html                         ← site (unchanged)
```
