# UI Boundary Design: index.html State & Module Extraction

## Overview

The Parallax UI layer (`index.html`) is currently a 3,563-line monolithic module with 109 functions and 9 mutable state objects. This document defines:

1. **Shared state ownership** — what each global tracks, who reads/writes it
2. **Communication pattern** — explicit params vs. centralized state
3. **Module extraction order** — 7-phase plan, from lowest-risk to highest-risk
4. **Red flags** — which code must NOT be extracted yet (risk of silent breakage)

## Section 1: Shared State Map

All mutable state at module scope in `index.html`:

| State Object | Declaration | Refs | Origin | Type | Mutators | Key Readers |
|--------------|-------------|------|--------|------|----------|-------------|
| `plan` | L169 | 234 | import from engine.js as `defaultPlan` | object | commitPlanEdit only | investableTotal, colSum, hybridTotal, renderStatement, renderInputs, most formatters |
| `scenarios` | L812 | 84 | initialized from demoScenarios | Map | resetScenarios, addScenario, removeScenario, rename handlers, solver-load, runAll | buildLevers, renderBand, renderSolvePanel, compareLeverage, all scenario renderers |
| `pathReplay` | L1985 | 26 | IIFE (L1985–2004) with localStorage backing | object | setPathReplay, clearPathReplay, 4 story/playback handlers | renderCfSidebar, sequencePlayback, renderPath* |
| `sharedPaths` | L2004 | 24 | initialized {} | Map<string, array> | ensureSharedPaths, reseedScenarios, commitPlanEdit | renderBand, runAll, trySuccess, tryLegacyProb, sequenceStory |
| `solverResults` | L424 | 14 | initialized {} | object | renderSolvePanel, reset/load handlers | renderSolvePanel, renderComboField, solveGoal UI |
| `comboResults` | L429 | 17 | initialized {} | object | renderSolvePanel, combo handlers, reset handlers | renderComboField, comboPillValue |
| `cfMode` | L3357 | 5 | initialized false | boolean | setCfMode handler | renderCashflow guard, renderCfSidebar toggle |
| `cfPrimary` | L3358 | 8 | initialized null | object or null | renderCfSidebar handlers | renderCashflow, cfDelta calculation |
| `cfCompare` | L3359 | 12 | initialized null | object or null | renderCfSidebar handlers | renderCashflow, cfDelta calculation |

**Co-traveling state** (coupled to above but secondary):
- `baseSnapshot` — baseline plan snapshot; written by reseedScenarios, runAll
- `plansDirty` — flag for plan modification; guards reseed flow
- `solverFormOpen`, `solverSearching`, `comboOpen`, `comboSearching` — UI state for solver panels
- `goalSelected`, `goalAreaOpen`, `goalAreaTiming`, `goalCostCache`, `goalCostToken` — goals modal state
- `running`, `acctSel`, `histSel`, `activeSub` — transient UI state

## Section 2: Read/Write Ownership (Verified via Grep)

### `plan` — Read-Mostly, Single Writer
- **Origin:** Imported as `defaultPlan` from `engine.js`; defaults to null until engine.js loads
- **Reads:** 234 references across aggregators (investableTotal, colSum, hybridTotal), statement/input renderers, edit handlers
- **Writes:** commitPlanEdit only (line ~2888)
- **Semantic:** Plan is the user's household data. It changes when the user edits income/expense/asset/liability fields. Typically static within a scenario run.

### `scenarios` — Many Writers, Central Read Hub
- **Origin:** demoScenarios() call early in page load
- **Writes:** resetScenarios, addScenario, removeScenario, rename handlers, solver "Load answer" button, runAll, commitPlanEdit
- **Reads:** buildLevers (render all), renderBand (scenario details), renderSolvePanel (solver UI), compareLeverage (delta display), all scenario comparison logic
- **Semantic:** Scenarios are the lever adjustments (income bumps, earlier retirement, etc.) the user tests. Multiple functions mutate scenarios; central hub for comparisons.

### `pathReplay` — localStorage-Backed Playback State
- **Origin:** IIFE with localStorage.getItem('pathReplay') on page load
- **Writes:** setPathReplay (L2019), clearPathReplay (L2024), setPlaybackYear, sequenceStory (set up story playback), sequencePlayback (advance frame)
- **Reads:** renderCfSidebar (play/pause button state), renderPath* (story frame display), sequencePlayback logic
- **Semantic:** Tracks narrative playback state (which year in story is displayed). Persists across page reloads via localStorage.

### `sharedPaths` — Sequencing Cache
- **Origin:** Initialized {}, populated by ensureSharedPaths
- **Writes:** ensureSharedPaths, reseedScenarios, commitPlanEdit (re-cache on plan edit)
- **Reads:** renderBand (per-scenario success ring), runAll (aggregate stats), trySuccess/tryLegacyProb (solver goal evaluation)
- **Semantic:** Caches simulation results per scenario so sequencing tab doesn't re-run engine on every render. Invalidated on plan edit or scenario change.

### `cfMode`, `cfPrimary`, `cfCompare` — Cash-Flow UI State
- **Origin:** cfMode = false (table hidden initially), cfPrimary/cfCompare = null
- **Writes:** renderCfSidebar handler (user clicks scenario chips to select for cash-flow view)
- **Reads:** renderCashflow (gate: only render if cfMode true), cfDelta calculation, renderCfSidebar toggle labels
- **Semantic:** Selects which scenario(s) are displayed in cash-flow table. Cross-cutting UI state (read by multiple renderers).

### `solverResults`, `comboResults` — Solver Output
- **Origin:** Initialized {}, populated by renderSolvePanel after solve completes
- **Writes:** renderSolvePanel (after solve or reset), combo reset handler
- **Reads:** renderSolvePanel (render solve output), renderComboField (combo options), "Load answer" button (feed solver result back to scenarios)
- **Semantic:** Temporary cache of solver search results and combo-box options. Cleared on reset.

## Section 3: Recommended Communication Pattern

### Rule 1: Explicit Parameters (Read-Mostly Data)
If a function only **reads** a value and **multiple modules** don't need to write it → **pass as parameter**.

**Example:** `investableTotal(plan)` instead of `investableTotal()` reading global `plan`.
- Benefit: function is testable in isolation, clear dependency, can thread different plans (household, baseline, etc.)
- Applies to: `plan`, any read-only config (LEVCFG, GOALS, SUB_PAGES)

### Rule 2: Small State Accessor (Cross-Cutting Mutable State)
If a value is **written by multiple modules** and **read by multiple modules** → **own it in a small state.js module** with explicit getter and setter functions.

**Example:**
```js
// state.js
export let scenarios = new Map();
export function setScenarios(newScenarios) {
  scenarios = newScenarios;
  // side effects: save to localStorage, mark plans dirty, invalidate caches
}

export let cfMode = false;
export function setCfMode(newMode) {
  cfMode = newMode;
  // side effects: rerender cash-flow table if DOM exists
}
```

**Benefit:** All mutations go through one place, side effects (localStorage, cache invalidation) are centralized, accidental mutations are visible.

**Applies to:** `scenarios`, `pathReplay`, `sharedPaths`, `cfMode`, `cfPrimary`, `cfCompare`, `solverResults`, `comboResults` — everything except `plan`.

---

## Section 4: Final Module Plan (7 Modules)

### Phase 1: `ui/formatters.js`
**Scope:** 7 truly-pure formatters (value → string)

**Exports:**
- `fmtM(value)` → `$1.2M`, `$500K`, etc.
- `fmtMoney(value)` → `$500,000` (full precision)
- `fmtMDelta(value)` → `+$500K` / `−$200K`
- `fmtPts(value)` → `+3.2 pts` / `−5.1 pts`
- `cfMoney(value)` → cash-flow table value format
- `cfRetPct(value)` → cash-flow % format
- `cfGain(value)` → `+$500K` / `−$200K` for cash-flow

**Constraints:**
- Zero imports from index.html globals
- Pure functions: deterministic output given input
- No formatters reading plan, scenarios, LEVCFG, or DOM

**Test:** Import and call with known values → expect known outputs

### Phase 2: `ui/charts.js`
**Scope:** Chart rendering primitives (after colors/dims passed in)

**Exports:**
- `niceCeil(value)` → smart ceiling (1.7M → 2M)
- `monoPath(points)` → SVG line path, no smoothing
- `smoothPath(points)` → SVG Catmull-Rom smoothed line
- `axes(width, height, ageStart, ageEnd, maxBalance)` → SVG axes + gridlines
- `storyChart(rows)` → balance chart from simulation
- `drawSeqChart(runs, retirementAge)` → resilience chart (forward vs reverse)
- `goalsThreadSVG(goals, palette)` → goals visualization
- `ring(percent, radius, strokeWidth)` → donut gauge SVG

**Constraints:**
- No hardcoded PADL, PADR, PADT, PADB (reconcile first; pass as parameters or constants in charts.js with single source)
- Colors passed in from controller (not read from DOM)
- No querySelector or addEventListener
- No DOM insertion (keep pure SVG generation; DOM mounting stays in controller)
- No imports from index.html globals

**Dependencies:** ui/formatters.js (for fmtM in axes)

**Note:** renderPrints (DOM insertion) is NOT a chart utility — keep it in controller or ui module that owns SVG mounting.

**Pre-extraction task:** Reconcile triple PADL (L2889=34, L3838=78, L3983=58) to single value.

**Test:** Unit test with known simulation data → expect known SVG output

### Phase 3: `state.js`
**Scope:** Centralized mutable state (scenarios, pathReplay, cf*, solver*)

**Exports:**
```js
// Scenarios (Array, not Map)
export { scenarios };
export function setScenarios(newArray) { ... }

// pathReplay
export { pathReplay };
export function setPathReplay(newReplay) { ... }
export function clearPathReplay() { ... }

// Cash-flow mode
export { cfMode, cfPrimary, cfCompare };
export function setCfMode(mode, primary, compare) { ... }

// Solver cache
export { solverResults, comboResults };
export function setSolverResults(results) { ... }
export function setComboResults(results) { ... }

// Plus all getters if computed reads are needed
```

**Constraints:**
- Pure state ownership (NO render logic whatsoever)
- Side effects only: localStorage persist, cache invalidation
- NO DOM manipulation, NO rerender calls
- Render orchestration stays in controller; state.js owns only mutation
- No imports from index.html (accept plan as parameter to functions that need it)

**Dependencies:** None (clean)

**Test:** Unit test mutation → verify side effects trigger

### Phase 4: `ui/household.js`
**Scope:** Plan + household-level aggregators and editors

**Exports:**
- `investableTotal(plan)` → sum of investable accounts
- `realAssetsTotal(plan)` → sum of property values
- `liabilitiesPVTotal(plan)` → PV of liabilities + mortgages
- `netWorthTotal(plan)` → investable + real − liabilities
- `colSum(plan, page, side)` → sum one column of statement
- `hybridTotal(plan, page)` → left + right total
- `renderStatement(plan, page)` → HTML for statement page
- `renderInputs(plan)` → HTML for input/edit forms
- `renderSnapshot(plan)` → HTML for snapshot page

**Special Handler (HIGH-RISK, NOT a pure render function):**
- `commitPlanEdit(field, newValue)` → 🛑 **Do NOT move in Phase 4 or early phases**
  - Mutation gateway: edits plan field
  - Triggers reseed cascade: reseedScenarios → invalidate sharedPaths → runAll
  - Side effects: localStorage persist (via state.js), trigger full UI re-orchestration
  - **Status:** Keep in controller/index.html for now. Move only after state.js + all dependent modules stable. Requires full integration testing.

**Constraints:**
- `plan` is explicit parameter to renderers, not global read
- Pure render functions (render*) take plan + generate HTML only
- No side effects in render functions; side effects belong in controller or state.js
- No imports from index.html globals

**Dependencies:** ui/formatters.js, state.js

**Test:** Unit test aggregators with known plan → expect known totals

### Phase 5: `ui/goals.js`
**Scope:** Goals modal and goal-cost tracking

**Exports:**
- `renderGoalsPage(plan, scenarios, pathReplay)` → goals tab HTML
- `paintGoalCosts(plan, scenarios)` → render goal costs in statement
- `scheduleGoalCosts(plan)` → timing of goal withdrawals
- `renderGoalsModal()` → goals editor dialog
- Plus goal selection/update handlers

**Constraints:**
- Imports state.js for goal selection state
- Calls state.js setters on goal changes
- Params: plan, scenarios (both from controller)

**Dependencies:** ui/formatters.js, state.js

**Test:** Render goals with known plan → verify cost calculations

### Phase 6: `ui/cashflow.js`
**Scope:** Cash-flow table and story/sequencing playback

**Exports:**
- `renderCfSidebar()` → scenario selector chips
- `renderCashflow(plan, scenarios, cfPrimary, cfCompare)` → cash-flow table HTML
- `cfDelta(plan, scenarios, primary, compare)` → calc differences
- `renderPath*(plan, pathReplay)` → story frame displays
- `sequenceStory(plan, scenarios)` → init story playback
- `sequencePlayback(direction)` → next/prev frame

**Constraints:**
- Imports state.js for cfMode, cfPrimary, cfCompare, pathReplay
- Calls state.js setters on UI changes
- Params: plan, scenarios (from controller)

**Dependencies:** ui/formatters.js, ui/charts.js, state.js

**Test:** Render cash-flow with known data → verify table structure and deltas

### Phase 7: `ui/scenarios.js`
**Scope:** Scenario lever grid and scenario-level render helpers

**Exports:**
- `buildLevers(scenarios, plan)` → lever grid HTML + event listener registration
- `renderBand(scenario, plan)` → scenario band with success ring
- `soloRowText(lever, baseValue, newValue)` → "55 → 62" label
- `comboPillValue(lever, baseValue, value)` → combo option label
- `stepper(value, min, max, step)` → numeric input HTML template
- `barFillPct(scenario, plan)` → bar fill % from lever range
- `levIcon(leverConfig)` → SVG icon lookup
- Plus scenario add/remove/rename handlers

**Constraints:**
- Imports state.js for scenarios and runAll orchestration
- Calls state.js setters on lever changes
- Params: plan (from controller)
- **NOTE:** runAll orchestrator stays in controller; not moved here

**Dependencies:** ui/formatters.js, state.js

**Test:** Render lever grid with known scenarios → verify HTML and lever math

---

## Section 5: Extraction Order

1. **ui/formatters.js** ← pure, zero deps, proves import pattern
2. **ui/charts.js** ← pure after PADL reconciled, low risk
3. **state.js** ← establish state boundary, no render logic
4. **ui/household.js** ← plan threading, aggregators, statement render
5. **ui/goals.js** ← goals cluster, medium risk (timing-dependent updates)
6. **ui/cashflow.js** ← cf* + path* state readers, medium risk
7. **ui/scenarios.js** ← largest module, highest risk (event listeners, lever math)

After all phases complete:
- **controller.js** (rename index.html module) — imports and orchestrates all modules
- **runAll()** stays here as the central orchestrator
- Delegated event listeners centralized here (one setup pass, not re-bound per render)

---

## Section 6: Red Flags — Do NOT Extract Yet

### 🛑 `runAll()` — THE ORCHESTRATOR
- **Why:** Orchestrates entire render cascade in a specific order: renderBand → buildLevers → renderCashflow → runSeq
- **If extracted early:** Moving this out of main controller before state.js and all render modules exist breaks the wiring order
- **When safe:** After state.js, phases 1–6 complete, and controller exists to call all modules
- **Action:** Keep in controller for now; move only as last step after all modules stable

### 🛑 Delegated Event Listeners (buildLevers and document-wide)
- **Why:** Currently re-attached on every buildLevers call (rebuild = re-register all listeners)
- **Problem:** Moving listeners to ui/scenarios.js while keeping buildLevers HTML generation there = risk of mismatched selectors if HTML changes later
- **When safe:** Only after delegated listeners are centralized (one permanent setup, not per-render re-bind)
- **Action:** Refactor event listeners to delegated form first (one-time setup), THEN extract scenarios.js

### 🛑 `commitPlanEdit()` — MUTATION GATEWAY (HIGH-RISK)
- **Why:** NOT a simple household render function; it is a mutation orchestrator. Triggers precise order: edit plan → reseedScenarios → invalidate sharedPaths → runAll. Any step skipped = silent cascade break
- **If extracted early:** Belong with ui/household.js, but only when plan threading + state.js hooks are stable AND all side-effect wiring verified
- **When safe:** ONLY after phases 1–3 complete, state.js is live, and household.js render functions are proven stable in integration tests
- **Action:** Keep in controller/index.html for now. Do not move until full integration testing confirms side effects (reseed, path cache invalidation, UI re-orchestration) all fire correctly

### 🛑 `cssToken()` — DOM-Coupled Color Reader
- **Why:** Reads live computed styles from `getComputedStyle(document.documentElement)`
- **If extracted:** ui/charts.js becomes DOM-coupled; breaks in tests or different DOM state
- **When safe:** Never directly; instead: resolve all chart colors in controller, pass as parameters to chart functions
- **Action:** Don't move. Instead: refactor charts to accept `(palette)` parameter: `axes(..., palette)`, `ring(..., palette)`

### 🛑 `pathReplay` IIFE + localStorage Roundtrip (Lines 1985–2026)
- **Why:** Compact IIFE that owns read/persist/write of pathReplay state + localStorage
- **If split:** localStorage sync breaks; stale data cached
- **When safe:** Keep in state.js as a colocated module; don't split read/write/persist
- **Action:** Move entire IIFE to state.js as initialization; keep tight

### 🛑 Triple PADL Definition (L2889=34, L3838=78, L3983=58)
- **Why:** Three separate values for the same chart padding, different contexts
- **If not reconciled:** ui/charts.js silently uses whichever is closest in scope; charts shift position
- **When safe:** Before ui/charts.js is extracted; decide: single constant, or context-specific passed-in value?
- **Action:** Audit and consolidate to one source; document intent if context-specific

### 🛑 innerHTML Blocks with onclick/data-* Attributes (e.g., buildLevers HTML)
- **Why:** HTML contains inline `onclick` and `data-*` attributes that serve as implicit contracts with delegated listeners
- **If HTML moves without updating listeners:** Buttons stop working (onclick not invoked) or wrong handler triggers
- **When safe:** Only when delegated listeners are centralized and HTML structure verified
- **Action:** Don't move HTML generation until listeners are refactored to permanent delegation

---

## Section 7: Formatter Correction (User-Refined)

Only these 7 formatters go in **ui/formatters.js**:

| Function | Input | Output | Depends On | Status |
|----------|-------|--------|-----------|--------|
| fmtM | number | "$1.2M", "$500K" | None | ✅ Pure |
| fmtMoney | number | "$500,000" | None | ✅ Pure |
| fmtMDelta | number | "+$500K", "−$200K" | None | ✅ Pure |
| fmtPts | number | "+3.2 pts", "−5.1 pts" | None | ✅ Pure |
| cfMoney | number | cash-flow format | None | ✅ Pure |
| cfRetPct | number | cash-flow % format | None | ✅ Pure |
| cfGain | number | "+$500K", "−$200K" | None | ✅ Pure |

**EXCLUDED** (belong in **ui/scenarios.js**, not formatters):

| Function | Why Not Pure | Destination |
|----------|-------------|-------------|
| soloRowText | reads LEVCFG, calls defaultLevers() | ui/scenarios.js |
| comboPillValue | lever-semantics value helper | ui/scenarios.js |
| stepper | returns HTML button markup | ui/scenarios.js |
| barFillPct | calls levRange() which reads plan | ui/scenarios.js |
| levIcon | returns SVG markup | ui/scenarios.js |

---

## Validation Checklist

- [ ] All 9 state objects mapped with read/write ownership
- [ ] Communication pattern clear: params vs state.js rule documented
- [ ] 7 modules defined with exports, constraints, dependencies
- [ ] Extraction order prioritizes low-risk (formatters) → high-risk (scenarios)
- [ ] Red flags documented; do-not-extract-yet list clear
- [ ] Formatter correction applied: 7 pure only, 5 UI helpers excluded
- [ ] No duplicate/contradictory guidance
- [ ] Architecture matches no-silent-breakage principle

---

## References

- **index.html** — 3,563 lines, 109 functions, original state map source
- **Code audit findings** — state verification via grep; read/write ownership traced
- **User approval** — formatter set refined 2026-06-15
