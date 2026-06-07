# PARALLAX — AI SYSTEM MAP
**Architecture · Codebase · Data Model · Data Flow · Calculation Engine**

> Companion to `AI_HANDOFF_MASTER.md` and `AI_PRODUCT_MEMORY.md`.
> This file is the **technical** transfer: how the system is built and how the
> numbers are computed. Everything here was read from the actual source on
> 2026-06-07 (branch `claude/ai-handoff-package-oWDF8`), not from memory.
>
> **Evidence tags:** `[CONFIRMED]` = read directly in code/tests · `[INFERRED]`
> = deduced from code but not explicitly stated · `[PROPOSED]` = planned, not
> built. File references are `path:line` and clickable.

---

## 0. THE 30-SECOND TECHNICAL PICTURE

Parallax is a **single-page, single-file, zero-backend, zero-build-step web
app**. There is no framework, no bundler, no server, no database, no API. It is:

- **`engine.js`** — a 1,369-line pure-computation ES module. The block-bootstrap
  Monte Carlo retirement engine. Verified. Sacred. No DOM, no UI. `[CONFIRMED]`
- **`parallax_v2.html`** — a 3,348-line single file: one `<style>` block, the
  full HTML, and ~2,500 lines of vanilla-JS UI in one `<script type="module">`
  that `import`s from `engine.js`. This is the **editing source of truth**. `[CONFIRMED]`
- **`build-standalone.mjs`** — inlines `engine.js` into `parallax_v2.html` and
  writes two identical outputs: `index.html` and `parallax.html` (so `file://`
  double-click works AND GitHub Pages serves it). `[CONFIRMED]`

Data lives in a single in-memory `plan` object (the engine's `defaultPlan`).
Scenario lever states + the active sub-page persist to `localStorage`. The live
site is **GitHub Pages serving `main`**: https://t66wwpvthy-prog.github.io/Parallax/

```
EDIT parallax_v2.html  ──build-standalone.mjs──▶  index.html + parallax.html
       │  (imports engine.js)                          (engine.js inlined)
       └────────────── engine.js (single truth source) ───────────────┘
```

---

## 1. SYSTEM ARCHITECTURE

### 1.1 High-level diagram `[CONFIRMED]`

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BROWSER (no server, no backend)                                            │
│                                                                            │
│  index.html / parallax.html  (built, engine inlined)                       │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  <style> (one block, ~850 lines, sage-glass theme tokens in :root) │     │
│  ├──────────────────────────────────────────────────────────────────┤     │
│  │  HTML shell: header (wordmark + tabs + Run) · 3 .page panels       │     │
│  ├──────────────────────────────────────────────────────────────────┤     │
│  │  <script type="module">                                            │     │
│  │    ENGINE (inlined in build; imported in source)  ◀── SACRED       │     │
│  │      runSimulation · runHistoricalPath · resolveInputs · …         │     │
│  │    UI LAYER                                                         │     │
│  │      plan (in-memory data root) ──▶ scenarios[] (lever states)     │     │
│  │      runAll() ──▶ engine ──▶ render{Band,Cashflow,Snapshot,…}      │     │
│  │      localStorage: scenarios.v2, netWorth.sub                      │     │
│  └──────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ deploy: GitHub Pages serves main
        │
   GitHub Actions:
     test.yml         → npm test (engine.test.js) on every push/PR
     build-pages.yml  → rebuild index/parallax.html on push, commit [skip ci]
```

### 1.2 Tech stack `[CONFIRMED]`

| Layer | Technology | Notes |
|---|---|---|
| Engine | Vanilla ES module (`engine.js`) | Pure functions, no deps |
| UI | Vanilla JS + HTML + CSS, single file | No React/Vue/framework |
| Fonts | Google Fonts: **Sora** (UI) + **Inter** (numbers) | `parallax_v2.html:8` |
| Persistence | Browser `localStorage` | 2 keys (see §5) |
| Build | `build-standalone.mjs` (Node, `fs` only) | String-replace inline |
| Test | `node --test engine.test.js` | 38 tests `[CONFIRMED]` |
| Visual verify | `scripts/verify.mjs` (Puppeteer/Playwright) | Headless screenshots |
| CI | GitHub Actions (2 workflows) | tests + auto-rebuild |
| Deploy | GitHub Pages (`main`) | `.nojekyll` present |

There is **no `node_modules` committed**, no backend service, no env vars
required at runtime. `package.json` only declares `playwright` + `puppeteer`
as devDependencies for the verify probe. `[CONFIRMED]`

### 1.3 State management `[CONFIRMED]`

There is no state library. State is three plain JS structures in module scope of
`parallax_v2.html`:

1. **`plan`** — the data root (engine's `defaultPlan`, imported then mutated by
   the input pages). The single source every simulation reads.
2. **`scenarios`** — `Array<{name, base, lev, res}>`. `lev` is the lever state
   for a column; `res` is the last engine result (recomputed on Run, never
   persisted). Initialized from `loadScenarios() || demoScenarios()`
   (`parallax_v2.html:1422`).
3. **`sharedPaths`** — a cached bundle of Monte Carlo return paths so every
   column in a Run sees the SAME markets and repeated Runs don't drift
   (`parallax_v2.html:2503`, `2524`).

Mutation flow: input pages write into `plan` → `reseedScenarios()` re-derives
each column from the new base while preserving its delta → `runAll()` runs the
engine per column → render functions paint the DOM.

---

## 2. COMPLETE CODEBASE MAP

### 2.1 Files that matter (production path) `[CONFIRMED]`

| File | Lines | Role | Risk of editing |
|---|---|---|---|
| `engine.js` | 1369 | **The truth source.** Pure MC engine. | EXTREME — change only with explicit sign-off; `engine.test.js` must stay green. |
| `parallax_v2.html` | 3348 | **UI source of truth.** Edit here, never the built files. | HIGH — one `<style>` block, cascade-order-sensitive (see §9 lessons). |
| `index.html` | (built) | Deployed artifact (engine inlined). GitHub Pages serves it from `main`. | Do NOT hand-edit — regenerated by build. |
| `parallax.html` | (built) | Identical to `index.html`; double-click/download copy. | Do NOT hand-edit. |
| `build-standalone.mjs` | 29 | Inlines engine → both built files. | MEDIUM — fragile regexes (see §6). |
| `engine.test.js` | 536 | 38 tests locking engine behavior. | Tests encode trusted properties — don't weaken to pass. |
| `scripts/verify.mjs` | 238 | Build + test + headless screenshot every page. | The "verify by pixels" gate. |
| `seq-data.js` | — | Standalone sequencing data (legacy/aux). `[INFERRED]` not in main import path. |

### 2.2 Documentation files `[CONFIRMED]`

| File | Contents |
|---|---|
| `CLAUDE.md` | Standing project brief (read first every session). **Note: its theme section is STALE — see §9.** |
| `HISTORY.md` | Chronological decision log / why-we-did-it. |
| `NOTES.md` | Running backlog / punch list / idea bank (newest on top). |
| `ROADMAP.md` | Indexed checklist of parked work (sections A–L). |
| `CODE_IMPROVEMENTS.md` | Banked audit findings, severity-ranked. |
| `HANDOFF.md` | Goals-board session handoff (dated 2026-06-04). |
| `IP-RECORD.md` | Timestamped prior-art record. |
| `Parallax-*.docx/.pdf/.pptx` | Generated artifacts (idea bank, principles, pitch). |

### 2.3 Parked / exploratory assets (NOT in the live app) `[CONFIRMED]`

- `aurora/` — a parked "Aurora glass" design exploration (separate HTML mocks +
  `tokens.css` + icons). Not wired into the build.
- `parallax_seq_*.html`, `goals-board.html`, `idea-bank.html`,
  `engine-explainer.html` — standalone mock/reference prototypes.
- `reference/` — screenshots and reference design files (RightCapital,
  MoneyGuidePro-style, Money Pro balance details, Aurora pack).
- `*.zip` — full-res design concept packs.
- `scripts/build_pitch.py`, `make-*.py` — generate the docx/pptx artifacts.

### 2.4 `.claude/` tooling `[CONFIRMED]`

- `skills/verify` · `skills/ship` · `skills/engine-guard` · `skills/bank` — slash
  commands (see §6 / Product Memory).
- `hooks/ship-reminder.sh` — Stop hook: blocks finishing if the branch is ahead
  of `origin/main` (Pages serves main → stale-site guard). Uses
  `git rev-list --count origin/main..HEAD`.
- `settings.json` — registers the Stop hook.
- `agents/qa-reviewer.md` — QA reviewer subagent for financial-logic changes.

> ⚠ **Stale doc warning `[CONFIRMED]`:** the `engine-guard` and `ship` skill docs
> say "13 tests"/"27/27". The real count is **38** (`grep -c test engine.test.js`).
> CODE_IMPROVEMENTS.md item #6 already flags this.

---

## 3. THE PLAN DATA MODEL

The entire app is driven by one object: `plan` (engine `defaultPlan`,
`engine.js:364`). Every field below is `[CONFIRMED]` from source. The engine
accepts **legacy shapes** for several arrays (back-compat) — noted inline.

```js
plan = {
  meta: { version:'v3.0-ledger', name, householdId, primaryName, spouseName,
          spouseAge, location, familyNotes },

  household: {
    primary: { currentAge:65, planEndAge:95, retirementAge:65 },
    spouse: null            // or { currentAge, ... }
  },

  portfolio: {
    riskProfile: 3,                       // 1..6 index into RISK_PROFILES
    withdrawalStrategy: 'taxable-first',  // | 'traditional-first' | 'proportional'
    accounts: {
      taxable:     { balance:2_000_000, basisPct:0.60 },  // basisPct → $ basis at resolve
      traditional: { balance:2_000_000 },                 // pre-tax
      roth:        { balance:1_000_000 }                   // tax-free
    },
    extraAccounts: []   // typed accts {label,bucket:'taxable'|'traditional'|'roth',balance}
  },

  savings: { annual:0, split:{ traditional:1, roth:0, taxable:0 } },  // pre-retirement only

  income: {
    socialSecurity: {
      primary: { pia:36000, claimAge:67 },   // pia = benefit at FRA, today's $
      spouse:  null                          // or { pia, claimAge }
    },
    other: [],   // [{label, amount, startAge, endAge, realGrowth, taxablePct}]  (legacy single obj OK)
    pension: { benefitByAge:{}, base:0, startAge:65, colaPct:0 }  // DISCRETE age→$ map, never interpolated
  },

  expenses: { living:188000, housing:0, debt:0, healthcare:12000,
              extra:[], healthcareRealGrowth:0.02 },  // extra:[{label,amount,startAge,endAge}]

  liabilities: [],   // [{label, amount, startAge, endAge, colaPct}]  colaPct nominal escalator
  properties: [],    // [{name, value, purchasePrice, appreciation, commissionPct,
                     //   mortgage:{balance, rate, termYears, startAge}}]
  ltc: { amount:0, onsetAge:85 },   // flat real LTC $/yr from onsetAge

  goals: [ {name, amount, startAge, endAge}, … ],   // one-time = startAge===endAge; legacy {vacation,…} OK

  taxes: { ordinary:22, capitalGains:15 },   // PERCENT, flat blended (stub — see §7 tax)
  simulation: { iterations:1000 }
}
```

### Field semantics worth knowing `[CONFIRMED]`

- **`basisPct`** (UI/plan) becomes **absolute `basis` dollars** in `resolveInputs`
  (`engine.js:624`). The engine works in dollars downstream.
- **`pension.benefitByAge`** is a discrete table. The engine looks up the EXACT
  claim age; a missing age pays **$0** — it never interpolates (deliberate: don't
  invent data). `engine.js:666-668`.
- **`colaPct`** (pension, liabilities) is a **nominal** escalator. The engine is a
  **real-dollar** model, so it converts: `colaReal = colaPct/100 − LONGRUN_INFLATION`.
  A 0%-COLA fixed payment therefore **erodes in real terms** at −2.5%/yr.
  `engine.js:672`, `773`, `792`.
- **`other[].realGrowth`** is per-stream real growth from its own startAge
  (negative = phases down). **`taxablePct`** = share taxed at ordinary rate.
- **`healthcare`** is NOT scaled by the spending lever; it has its own
  `healthcareRealGrowth` compounding from retirement. `engine.js:752-754`, `970`.

### UI-side state objects `[CONFIRMED]`

**Lever state `L`** (`defaultLevers()`, `parallax_v2.html:863`):
```js
{ retireAge, ssAge, spend, eventAmt, eventAge, risk, savings,
  pensionAuto:true, pensionAge, sellAge }
```
`pensionAuto` makes the pension age track retirement until the advisor grabs the
slider. `sellAge` sentinel `currentAge−1` renders "Keep" (no sale).

**Scenario object** (`parallax_v2.html:1409`):
```js
{ name:'Baseline', base:true, lev:{…}, res:<engine result|null> }
```
Only `{name, base, lev}` persist to `localStorage` (`saveScenarios`, `:897`).

---

## 4. DATA FLOW — TRACED EXAMPLES

### 4.1 "Advisor drags a Scenario's Retirement Age slider" `[CONFIRMED]`

```
User drags slider
  → commitLever(ci,cfg) / updateCell  (parallax_v2.html:2669, 2678)
  → scenarios[ci].lev.retireAge = newVal
  → if pensionAuto: syncPension(L)            (pension age tracks retirement)
  → runAll()                                  (parallax_v2.html:2506)
      → ensure sharedPaths bundle (resetSeed + generateReturnPath × iters)
      → per scenario: p = planForScenario(lev)        (risk → plan clone)
                      ov = leversToOverrides(lev)      (other levers → overrides)
                      s.res = runSimulation(p, ov, sharedPaths)   ◀── ENGINE
  → renderBand()      paints the % success circles + deltas
  → renderFoot()      median end wealth
  → renderCashflow()  per-scenario year table (typical path)
  → buildSeqSelect(); runSeq()   refresh Sequencing for the selected scenario
```

**Key invariant:** every column runs through the **same `sharedPaths`** bundle, so
any difference between columns is the **decision**, never sampling luck
(Parallax Doctrine #6).

### 4.2 "Lever → engine override" mapping `[CONFIRMED]` (`leversToOverrides`, `:1428`)

| Lever (`L`) | Override | Notes |
|---|---|---|
| `retireAge` | `retireDelay = retireAge − base` | |
| `ssAge` | `ssDelayYears = ssAge − base` | signed shift to primary's claim age |
| `spend` ↑ | `spendBump = frac` | engine ignores negative bump… |
| `spend` ↓ | `spendCut = −frac` | …so cuts MUST route here (capped 50%) |
| `eventAmt`/`eventAge` | `lumpSum` + `lumpSumYear` | one-time outflow |
| `savings` | `savingsBump = frac` | vs `plan.savings.annual` |
| `pensionAge` | `pensionStartAge` (absolute) | discrete benefitByAge lookup |
| `sellAge` (≥curAge) | `assetSale = {asset:0, age}` | only emitted when a real sale |
| `risk` | **NOT an override** → `planForScenario` clones plan, sets `riskProfile` | allocation needs a new plan |

### 4.3 "Net Worth input edit" `[CONFIRMED]`

```
Edit a field on Balance Sheet / Cash Flow / Goals page
  → setPath(plan, 'expenses.living', val)   (parallax_v2.html:1553)
  → sharedPaths = null  (invalidate cached markets — plan changed)
  → reseedScenarios()   re-derive each column from new base, preserve deltas
  → runAll()            (recompute everything)
```

### 4.4 "Sequencing tab renders" `[CONFIRMED]`

```
Pick a scenario in the dropdown + toggle market chips (SEQ_YEARS)
  → runSeq()  (parallax_v2.html:3186)
      → entry balance = the scenario's MEDIAN projected balance at retirement
        (envelope p50 via a "retire-now" clone — retireNowClone, :3166)
      → for each lit market year: runHistoricalPath(plan, year, strat, transform, ov)
        (engine.js:1311 — same plan, REAL historical return sequence from that year)
  → drawSeqChart(runs, retAge)  (one line per market, decision-zone y-cap)
  → renderPrints(runs)          (outcome cards: first-decade / lowest / survived|ran-dry)
```

---

## 5. PERSISTENCE (localStorage) `[CONFIRMED]`

| Key | Written by | Contents | Notes |
|---|---|---|---|
| `parallax.scenarios.v2` (`SCEN_KEY`) | `saveScenarios` `:897` | `[{name,base,lev}]` (no `res`) | forward-compat backfill on load (`:909`) |
| `parallax.netWorth.sub` (`SUB_KEY`) | sub-nav | active Net Worth sub-page | falls back to `balance-sheet` |

No cookies, no IndexedDB, no remote storage. Corrupt/blocked storage is caught and
the app stays in-memory (`:901`).

---

## 6. BUILD, TEST, VERIFY, DEPLOY

### 6.1 Build `[CONFIRMED]` (`build-standalone.mjs`)
- Reads `parallax_v2.html` + `engine.js`.
- Strips engine's `export {…}` block via regex `/export\s*\{[\s\S]*?\};?\s*$/m`.
- Replaces the HTML's `import {…} from "./engine.js";` with the engine source.
- Writes **identical** `index.html` + `parallax.html`.
- ⚠ **Fragility (CODE_IMPROVEMENTS #3):** both regexes assume exactly one match;
  if those lines reformat, the substitution silently no-ops and ships a broken
  file while printing success. No assertion that `out !== html`.

### 6.2 Test `[CONFIRMED]`
- `node --test engine.test.js` → **38 tests**. Cover: data span, reproducibility,
  allocation monotonicity, 1973 sequence risk, reverse-path identity, override
  flow, pension discrete lookup, liabilities/erosion, lump sum in accumulation,
  RMDs, savings split, Roth vs pre-tax, typed accounts, healthcare independence,
  other-income growth/taxability, asset-sale net-proceeds math.
- **Gap (CODE_IMPROVEMENTS #1):** the *lever surface* (ssDelayYears, riskProfile
  trade-off, stress knobs, LTC, withdrawal strategies) is ~0% tested — the core
  "higher line / lower circle" thesis is unit-untested.

### 6.3 Verify `[CONFIRMED]` (`scripts/verify.mjs`)
- Builds → runs engine tests → serves on :8765 → drives headless Chromium at
  1920×1080 @ 3× (5760×3240 screenshots) → asserts each page actually rendered
  (DOM has rows AND height, chart has paths) → writes `verify-out/*.png`.
- **This is the "logic checks lie, pixels don't" gate.** Run before claiming any
  visual change is done.
- **Gaps (CODE_IMPROVEMENTS #2):** never drives a lever / asserts a number moved;
  page/console errors are non-fatal (a runtime crash can ship "green").
- Screenshot names actually written: `01-balance-sheet`, `02-cashflow`,
  `02-goals`, `02-snapshot`, `03-scenarios`, `04-cashflow`, `05-sequencing`,
  `06-property`. (The `verify/SKILL.md` doc lists wrong names — stale.)

### 6.4 Deploy `[CONFIRMED]`
- **GitHub Pages serves `main`.** Push to BOTH the working branch and `main`
  (the `/ship` skill does this). Live: https://t66wwpvthy-prog.github.io/Parallax/
- `build-pages.yml` auto-rebuilds the standalone on push and commits it back with
  `[skip ci]`, ignoring pushes that only touch `index.html`/`parallax.html`.
- `test.yml` runs `npm test` on every push/PR.
- **Branch reality `[CONFIRMED]` today:** remote has `main` and
  `claude/ai-handoff-package-oWDF8` only; the working branch is **even with
  `origin/main`** (0 ahead). CLAUDE.md names `claude/laughing-einstein-c6F33` as
  canonical, but that branch is **not present on this remote** — treat CLAUDE.md's
  branch name as historical; the live deploy target is `main`.

---

## 7. THE CALCULATION ENGINE (`engine.js`) — IN DEPTH

> The engine is **real-dollar** (inflation-adjusted) throughout. There is no
> nominal balance anywhere except the historical-playback bridge and the
> asset-sale cap-gains calc, which explicitly bridge to nominal and back.

### 7.1 Return data `[CONFIRMED]`
- `RETURN_DATA` (`:138`): **98 years, 1928–2025**, REAL annual returns for 8 asset
  classes (usLarge, usSmall, intlDev, emerging, usBonds, cash, reit, gold).
  Pre-1985 international/REIT cells are `null` (handled by sleeve renormalization).
- `HISTORICAL_NOMINAL_RETURNS` (`:295`): nominal S&P + 10-yr T-bond per year
  (Damodaran), used ONLY by historical playback to derive a CPI bridge so
  non-/partial-COLA streams can be reasoned about. `real = (1+nominal)/(1+infl)−1`.

### 7.2 Asset model & allocations `[CONFIRMED]`
- `EQUITY_MIX` (growth sleeve): usLarge .50, usSmall .10, intlDev .22,
  emerging .08, reit .10. `DEFENSIVE_MIX`: usBonds .75, cash .17, gold .08.
- `buildAssetWeights(eqShare)` blends the two sleeves.
- `RISK_PROFILES` **1..6**: 30/45/60/75/90/100 % growth. (UI exposes **1..5** as
  Conservative→Aggressive via `RISK_LABELS`; profile 6 = All Equity exists in the
  engine.) `:267`.
- `weightedAssetReturn(row, weights)` (`:506`): sleeve-aware — if an asset's data
  is `null` for a year, its weight is **renormalized within its sleeve** (so early
  years don't silently zero-out missing classes). A whole-sleeve fallback exists
  for hypothetical future data gaps.

### 7.3 The Monte Carlo path generator `[CONFIRMED]`
- `generateReturnPath(horizon)` (`:491`): **block bootstrap** — repeatedly grabs a
  contiguous block of **3–5 real years** from `RETURN_DATA` at a random start and
  concatenates until the horizon is filled. Blocks preserve real autocorrelation
  (momentum, mean-reversion) that IID sampling destroys.
- RNG is **seeded mulberry32** (`rand`, `:483`; `resetSeed`, `:482`;
  `DEFAULT_SEED = 0x9e3779b9`). Identical inputs → identical draws → no ±1% drift
  on refresh. The only randomness in the whole engine is these two `rand()` calls.

### 7.4 `resolveInputs(plan, overrides)` `[CONFIRMED]` (`:570`)
Pure translation of `plan` + overrides into a flat `inputs` object the sim loop
consumes. Responsibilities:
- Horizon = `(planEndAge + longevityYears) − currentAge`.
- **Social Security:** `ssAdjust(pia, claimAge)` applies the **real SSA actuarial
  schedule** (`:129`): FRA=67; late filing +8%/yr to 70; early filing −5/9%/mo
  for first 36 mo then −5/12%/mo (62 = −30%). Each person's benefit is mapped onto
  the **primary's age timeline** so a differently-aged spouse switches on in the
  right sim year. `ssDelayYears` shifts the primary's claim age; `ssCut` haircuts.
- **Spending multiplier:** `spendMult = (1 − clamp(spendCut,0,.5)) × (1 + max(0,spendBump))`.
- **Initial shock:** `initialShock × equityShare` applied to balances (basis
  unchanged — basis is cost, not market value).
- **Typed extra accounts** fold into their tax sleeve before shock/basis.
- **Savings split** normalized (default 100% traditional, back-compat).
- **Pension** discrete lookup + `colaReal`.
- **Asset sale** (`assetSale` override): resolves NET proceeds deterministically —
  bridges real→nominal at sale year, computes cap-gains on **nominal** gain
  (because basis is historical cost), subtracts commission + mortgage payoff +
  §121 exclusion, deflates back to today's dollars. `:676-718`.
- **Property mortgages** are amortized (`annualMortgagePayment`, `:449`) into a
  fixed-nominal annual payment appended to `liabilities` (so they reuse the tested
  cash-flow path; if the property is sold, payments stop the year before sale).
- Tax rates: `ordinary`/`capitalGains` × `(1 + taxMult)` / 100.

### 7.5 `runSinglePath(inputs, returnPath)` `[CONFIRMED]` (`:849`) — the core loop
Clones account state, then walks year-by-year:

**Accumulation phase (`age < retirementAge`)** `:893`:
- Portfolio compounds at the year's return `r`; mid-year contribution factor
  spreads savings; contributions routed per `savingsSplit`; taxable contributions
  add to basis.
- One-time lump outlay + active goals are funded by liquidation
  (taxable→traditional→Roth, principal only).

**Retirement phase** `:950`:
1. External income: SS (per started benefit), other income (real-grown, partly
   taxable), pension (real-eroded by colaReal). LTC cost if `age ≥ onsetAge`.
2. Expenses: living+housing+debt (scaled by spendMult) + **healthcare**
   (its own real growth, NOT spend-scaled) + extras + goals + liabilities + lump.
3. Tax on income: **85% of SS** + taxable share of OI + 100% of pension, all at
   the flat ordinary rate. `:985`.
4. `gap = (expenses + goals + liabilities + lump) − netIncome`.
5. `fundGap(accounts, gap, taxRates, strategy)` (`:13`) withdraws to cover the
   gap, **grossing up** for taxes per source (taxable: cap-gains on the embedded
   gain fraction; traditional: ordinary; Roth: tax-free). Returns breakdown +
   tax + shortfall.
6. Mid-year withdrawal factor applied per account; taxable **basis consumed
   proportionally** to the gross taxable withdrawal.
7. **RMD** (`age ≥ 73`): required = prior-year-end traditional ÷
   `UNIFORM_LIFETIME[age]`; only the shortfall beyond what spending already pulled
   is forced; taxed as ordinary; the after-tax remainder is **reinvested into
   taxable as pure basis** (you must TAKE it, not spend it → net effect is just the
   tax). `:1043-1061`. (Roth is RMD-exempt.)
8. Floor accounts at 0; mark `failed` + record `depletionAge` if depleted or
   shortfall remains.
9. Emit a per-year `row` (balance, withdrawal, income components, taxes,
   netCashflow, per-account balances, tax-by-source, RMD, return used, …) — this
   row stream is what the cash-flow view reads (a VIEW of existing truth).

Returns `{rows, failed, cagr, terminalBalance, minBalance, maxDrawdown,
depletionAge, first10Cagr, balanceAt10, lifetimeTax}`.

### 7.6 `analyzeResults(sims, inputs)` `[CONFIRMED]` (`:1138`)
Aggregates the sims into the results object the UI consumes:
- **`successRate`** = % of sims that didn't fail.
- **`envelope`** = per-year p10/p25/p50/p75/p90 of balances (a boundary, NOT a
  coherent path). Computed first because the representative path uses it.
- **`terminal`** = p10..p90 of terminal balances.
- **`paths`** = representative sims. p10/p25/p75/p90 sorted by `balanceAt10`
  (sequence-risk emphasis). **p50 = a two-stage MEDOID** (`:1196`): Stage 1 keep
  the most central-by-outcome decile; Stage 2 within it pick the path whose
  return volatility is closest to median — so the cash-flow table shows a
  *typical, realistically bumpy* path, not a balance-central outlier. Display-only;
  doesn't touch the truth math.
- **`metrics`**: medianDepletionAge, medianMinBalanceSurvivors,
  medianMaxDrawdownSurvivors, medianYearsUnderwater, worstMaxDrawdown,
  worstFirst10Cagr, aboveStartCount, doubledCount, bigDrawdownCount.
- `medianCagr`, `medianLifetimeTax`.

### 7.7 `runHistoricalPath(plan, startYear, strategy, transform, overrides)` `[CONFIRMED]` (`:1311`)
One coherent path retiring INTO a real year. Builds the path from `startYear`
forward, **wrapping** past 2025 back to 1928 (cyclic, like the bootstrap) so recent
years get a full horizon. Optional `transform` reorders the same rows (used by a
now-removed reverse-sequence experiment). `overrides` flow through the same
`resolveInputs` mapping, so the Sequencing tab sequences the FULL chosen scenario,
not just its allocation.

### 7.8 Known engine limitations `[CONFIRMED]` (CODE_IMPROVEMENTS / ROADMAP)
- **Tax is a flat blended stub** — no brackets, standard deduction, filing status,
  SS provisional tiers, IRMAA, NIIT, or state tax. SS taxed at a flat 85%. A real
  progressive **tax engine** is the next BIG planned change (ROADMAP §L).
- **No survivor SS step-up** — both spouses' benefits run the full horizon;
  overstates late-life income for couples. Most material simplification.
- **Healthcare is scaled by spendMult inside `expenses.living` siblings only** —
  healthcare itself is correctly excluded, but ROADMAP notes spendMult still
  skews Solve-For's spending answer because healthcare doesn't move with it.
- **LTC is flat real** (should escalate ~3–5% above CPI).
- **`fundGap` basis denominator** edge case under `proportional` strategy (never
  set in UI → dead path). `engine.js:49`.
- **`ASSET_STATS[k].mean`** computed but unused — deletable.
- Cap-gains use **average embedded gain**, not lot-level/HIFO; rental sales miss
  §1250 depreciation recapture.

---

## 8. UI MODULE MAP (`parallax_v2.html`) `[CONFIRMED]`

Three top-level pages (header tabs): **Net Worth** (default), **Scenarios**,
**Sequencing**. Net Worth has 4 sub-pages via `SUB_PAGES` (`:1487`):
`balance-sheet` (statement layout), `cashflow` (hybrid), `goals` (board),
`snapshot`.

### Key functions by area
- **Scenario engine glue:** `defaultLevers` `:863`, `leversToOverrides` `:1428`,
  `planForScenario` `:1457`, `runAll` `:2506`, `reseedScenarios` `:1578`.
- **Persistence:** `saveScenarios` `:897`, `loadScenarios` `:903`,
  `demoScenarios` `:1409`.
- **Solver (Solve-For):** `solveLeverFor` `:972` (bisection), `solveBand` `:1059`,
  `renderSolvePanel` `:1115`, combo helpers `:1259-1409`.
- **Input pages:** `renderStatement` `:1854`, `renderHybrid` `:1908`,
  `renderGutter` `:1695`, `renderInputs` `:2305`, field/row helpers `:1738-1853`.
- **Goals board:** `renderGoalsBoard` `:2133`, `initGoalsBoard` `:2174`
  (drag/snap/rank, rank persisted but feeds NO math).
- **Snapshot:** `snapshotMetrics` `:1974`, `renderSnapshot` `:2001`.
- **Scenario band:** `LEVCFG` `:2458`, `renderBand` `:2571`, `ring`/`ringColor`
  `:2551`, `stepper`/sliders `:2629`, `syncGridCols` `:2565`.
- **Cash-flow view:** `renderCashflow` `:3038`, money/return formatters
  `:3030-3037`.
- **Sequencing:** `SEQ_YEARS` `:3133`, `runSeq` `:3186`, `drawSeqChart` `:3207`,
  `renderPrints` `:3273`, `retireNowClone` `:3166`.
- **Chart helpers:** `monoPath` `:2964` (monotone smoothing, in use), `axes`
  `:3006`, `smoothPath` `:2994` (**dead — superseded by monoPath**).

### `LEVCFG` — the lever surface `[CONFIRMED]` (`:2458`)
`retireAge`(55–72), `ssAge`(62–70), `spend`(80k–360k, stored annual/edited
monthly), `eventAmt`(0–500k + age), `risk`(1–5), `savings`(0–200k),
`pensionAge`(55–70, discrete benefitByAge), and a conditional `sellAge` lever only
when a property exists. Discrete levers use **steppers**; dollar levers use
**sliders** (deliberate — see Product Memory).

---

## 9. ⚠ DOC-vs-CODE DISCREPANCIES A NEW AI MUST KNOW `[CONFIRMED]`

1. **Theme.** CLAUDE.md repeatedly says the live theme is a light "paper" report
   and that a dark theme was rejected. **The actual `:root` in `parallax_v2.html`
   (`:10-37`) is a DARK "SAGE GLASS" theme** — sage-green ground `#1e3d2b`, copper/
   clay accent `#D9A07E`, frosted-glass translucent panels. The git log confirms it:
   *"Revert to copper theme — porcelain rejected by Nathan; work preserved on
   claude/porcelain-glass"*. **Trust the code (`:root`) over CLAUDE.md's theme
   prose.** The "Theme tokens (dark Sage-Brass)" block in CLAUDE.md is also a
   different/older palette — treat all theme prose as historical; the running
   `:root` is the only source of truth.

2. **Test count.** Skill docs say 13/27. Real = **38**.

3. **Canonical branch.** CLAUDE.md says `claude/laughing-einstein-c6F33`. That
   branch isn't on this remote; deploy target is **`main`**.

4. **Scenarios line chart.** CLAUDE.md's spec describes a deterministic
   expected-wealth hero LINE on the Scenarios tab. NOTES.md (`:482-488`) records
   that the **line was REMOVED** ("redundant with the % circles + cash-flow
   drawer"); a richer wealth-path visual was moved to Sequencing. So the current
   Scenarios tab is **circles + levers + cash-flow**, not a line chart. Confirm in
   the running app before acting on the line-chart spec.

These are not bugs — they're the inevitable drift between a fast-moving build and
its brief. When in doubt, **run the app and read `:root`/the render functions.**
</content>
</invoke>
