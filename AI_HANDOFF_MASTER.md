# PARALLAX — COMPLETE AI HANDOFF PACKAGE (MASTER)

> **Purpose.** This is a full AI-to-AI handoff for the Parallax project. It
> assumes the receiving model has **never seen this project**. The goal is not to
> summarize — it is to transfer everything required to understand, maintain,
> extend, redesign, debug, and reason about the application exactly as the prior
> model does today.
>
> **Companion files (read these too — they go deeper without context limits):**
> - `AI_SYSTEM_MAP.md` — architecture, codebase map, data model, data flow, the
>   full calculation engine.
> - `AI_PRODUCT_MEMORY.md` — vision, philosophy, design language, roadmap,
>   institutional lessons.
>
> **Evidence tags used throughout:** `[CONFIRMED]` (read in source/tests on
> 2026-06-07, branch `claude/ai-handoff-package-oWDF8`) · `[INFERRED]` (deduced
> from code) · `[PROPOSED]` (planned, not built). File refs `path:line` are
> clickable.

---

## SECTION 1 — EXECUTIVE OVERVIEW

### 30-second understanding
Parallax is a **single-file, zero-backend web app**: a retirement-planning
simulator for financial advisors. Its heart is **`engine.js`**, a verified, pure
block-bootstrap Monte Carlo engine running on **98 years of real return data
(1928–2025)**. The UI (`parallax_v2.html`) is vanilla JS that imports the engine
and presents two analysis surfaces — **Scenarios** (compare choices; same markets,
only levers differ) and **Sequencing** (same plan through real historical market
orders) — plus **Net Worth** input pages. A build step inlines the engine into
`index.html`/`parallax.html`, which **GitHub Pages serves from `main`.** The
product's entire reason to exist is **neutrality**: it reports the truth (good or
bad) where every competitor is biased toward fear.

- **What it is:** professional retirement-planning instrument for advisors.
- **Problem it solves:** existing tools bias outputs conservative to sell products
  and manage fear; advisors can't fully trust them in front of a client. Parallax
  has no thesis — it runs the math and reports what's there.
- **Who it serves:** fee-only RIAs / personal-CFO practices (150–300+ households,
  $100M–$500M+ AUM). NOT consumers.
- **Primary persona:** Nathan (CFP, product owner) and advisors like him.
- **Core philosophy:** the PROGRAM shows the story; the ADVISOR tells it. Model
  interactions, show truth, stay neutral.
- **Key differentiators:** (1) a real, fast, *verified* engine on real return
  data; (2) apples-to-apples comparison (same market draws across columns); (3)
  the planned **explainable multi-variable solver** ("what must move to hit this
  goal?") that weaker engines can't credibly do.

---

## SECTION 2 — PRODUCT PHILOSOPHY

(Full treatment in `AI_PRODUCT_MEMORY.md §3–5.`)

**The three core principles:** (1) model INTERACTIONS, not isolated stats; (2)
show the TRUTH, advisor narrates — cut any editorial sentence; (3) NEUTRALITY — no
opinion, the same gauge reads green for good news and red for bad.

**The doctrine (apply to every decision):** make requirements less dumb · delete
before adding · simplify the process · cut beats refactor · **the engine is the
single truth source (UI never re-derives numbers)** · default to the
implementation most faithful to purpose.

- **Design:** faithful-and-ugly beats clever-and-broken; go deep on one thing, not
  wide on five.
- **UX:** hero number always on screen; dashed underline = editable, solid =
  result.
- **IA:** inputs are a data-entry workflow on dedicated pages feeding UP into
  analysis — NOT a live control panel; no stale/needs-review machinery.
- **Data presentation:** show the interaction, never the anecdote; no narrative
  prose.
- **Decisions:** terminal wealth is NOT the objective — only a sort/rank device.

**What must NEVER change:** engine-as-truth-source; neutrality / no editorial
prose; same-markets-across-columns; deterministic noise-free comparison;
verify-by-pixels; push to both branch and main.

**Common mistakes future devs make:** re-deriving numbers in the UI; adding
tabs/views for "cool" (re-bloat); "optimizing" CSS and reordering the cascade;
claiming UI done from a logic check; resurrecting rejected ideas.

---

## SECTION 3 — SYSTEM ARCHITECTURE

(Full diagrams + traces in `AI_SYSTEM_MAP.md §1, §4.`)

```
BROWSER (no server / no backend / no framework)
  index.html (built; engine inlined)
    <style> one block, sage-glass tokens in :root
    HTML: header (wordmark · tabs · Run) + 3 .page panels
    <script type=module>
       ENGINE (inlined)  ── runSimulation · runHistoricalPath · resolveInputs
       UI: plan ─▶ scenarios[] ─▶ runAll() ─▶ engine ─▶ render*()
       localStorage: scenarios.v2 · netWorth.sub
        │ deploy
GitHub Pages serves main · Actions: test.yml (engine tests) + build-pages.yml (auto-rebuild)
```

- **Frontend:** vanilla JS/HTML/CSS, single file. Fonts Sora (UI) + Inter
  (numbers). No React/build tooling. `[CONFIRMED]`
- **Backend / services / APIs:** **none.** Fully client-side. `[CONFIRMED]`
- **Storage:** browser `localStorage` (2 keys). `[CONFIRMED]`
- **State management:** three module-scope structures — `plan` (data root),
  `scenarios` (lever states + last result), `sharedPaths` (cached MC bundle). No
  state library. `[CONFIRMED]`

**Canonical data-flow trace** (drag a lever):
`commitLever → scenarios[ci].lev mutated → runAll() → (per column) planForScenario
+ leversToOverrides → runSimulation(p, ov, sharedPaths) → renderBand/renderFoot/
renderCashflow/runSeq`. Every column shares one `sharedPaths` bundle so any
difference is the *decision*, not luck. `[CONFIRMED]`

---

## SECTION 4 — COMPLETE CODEBASE MAP

(Full table in `AI_SYSTEM_MAP.md §2.`) Production-path files:

| File | What it does | Why it exists | Risk of modifying |
|---|---|---|---|
| `engine.js` (1369) | Pure MC engine + return data + all financial math | The single truth source | **EXTREME** — sign-off + `engine.test.js` must stay green |
| `parallax_v2.html` (3348) | UI source of truth (one style block + one module script) | The app | HIGH — cascade-order-sensitive |
| `index.html` / `parallax.html` (built) | Deployed artifacts, engine inlined | Pages serve `index.html`; `parallax.html` = double-click copy | Do NOT hand-edit (regenerated) |
| `build-standalone.mjs` (29) | Inlines engine → both built files | `file://` blocks ES module imports | MEDIUM — fragile regexes |
| `engine.test.js` (536, **38 tests**) | Locks trusted engine behavior | Engine can't silently break | Don't weaken tests to pass |
| `scripts/verify.mjs` (238) | Build + test + headless screenshots | "Pixels don't lie" gate | — |

**Docs:** `CLAUDE.md` (brief — theme section STALE), `HISTORY.md` (why),
`NOTES.md` (backlog/idea bank), `ROADMAP.md` (indexed checklist),
`CODE_IMPROVEMENTS.md` (audit findings), `HANDOFF.md`, `IP-RECORD.md`.

**Parked/exploratory (NOT live):** `aurora/`, `parallax_seq_*.html`,
`goals-board.html`, `idea-bank.html`, `engine-explainer.html`, `reference/`,
`*.zip`, `scripts/*.py`, `seq-data.js`.

**Tooling:** `.claude/skills/{verify,ship,engine-guard,bank}`,
`.claude/hooks/ship-reminder.sh` (Stop hook: blocks finishing while branch ahead
of `origin/main`), `.claude/agents/qa-reviewer.md`.

**Key UI functions** (`parallax_v2.html`): `runAll` :2506 · `leversToOverrides`
:1428 · `planForScenario` :1457 · `defaultLevers` :863 · `LEVCFG` :2458 ·
`renderBand` :2571 · `renderCashflow` :3038 · `SEQ_YEARS` :3133 · `runSeq` :3186 ·
`renderGoalsBoard` :2133 · `snapshotMetrics` :1974 · `SUB_PAGES` :1487.

---

## SECTION 5 — DATA MODEL

(Full annotated schema in `AI_SYSTEM_MAP.md §3.`) The whole app is driven by one
`plan` object (engine `defaultPlan`, `engine.js:364`). Top-level keys and meaning:

- **`meta`** — name/version/household identity.
- **`household.primary`** `{currentAge, planEndAge, retirementAge}`; `spouse` null
  or `{currentAge,…}`.
- **`portfolio`** — `riskProfile` (1..6 index), `withdrawalStrategy`
  (`taxable-first`|`traditional-first`|`proportional`), `accounts.{taxable
  {balance,basisPct}, traditional{balance}, roth{balance}}`, `extraAccounts[]`.
- **`savings`** `{annual, split{traditional,roth,taxable}}` — pre-retirement only.
- **`income`** — `socialSecurity.{primary{pia,claimAge}, spouse}`; `other[]`
  (`{label,amount,startAge,endAge,realGrowth,taxablePct}`); `pension`
  (`{benefitByAge{age:$}, base, startAge, colaPct}` — discrete, never
  interpolated).
- **`expenses`** `{living, housing, debt, healthcare, extra[], healthcareRealGrowth}`.
- **`liabilities[]`** `{label,amount,startAge,endAge,colaPct}` (nominal escalator).
- **`properties[]`** `{name,value,purchasePrice,appreciation,commissionPct,
  mortgage{balance,rate,termYears,startAge}}`.
- **`ltc`** `{amount, onsetAge}`; **`goals[]`** `{name,amount,startAge,endAge}`
  (one-time = startAge===endAge).
- **`taxes`** `{ordinary, capitalGains}` (PERCENT, flat blended stub).
- **`simulation`** `{iterations:1000}`.

**Validation/normalization (in `resolveInputs`):** `basisPct`→absolute `$ basis`;
spendCut clamped 0–0.5; savings split normalized (default 100% traditional);
legacy array shapes accepted (`other`/`goals`/`expenses.extra`); pension lookup
returns 0 for an unentered age (no invention). `[CONFIRMED]`

**UI state objects:** lever state `L` (`defaultLevers`, :863) and scenario object
`{name,base,lev,res}` (only `{name,base,lev}` persisted). `localStorage` keys:
`parallax.scenarios.v2`, `parallax.netWorth.sub`.

**Example plan fragment:**
```js
household: { primary:{ currentAge:65, planEndAge:95, retirementAge:65 } }
portfolio: { riskProfile:3, withdrawalStrategy:'taxable-first',
             accounts:{ taxable:{balance:2e6,basisPct:.6}, traditional:{balance:2e6}, roth:{balance:1e6} } }
income.socialSecurity.primary: { pia:36000, claimAge:67 }
expenses: { living:188000, healthcare:12000, healthcareRealGrowth:0.02 }
taxes: { ordinary:22, capitalGains:15 }
```

---

## SECTION 6 — CALCULATION ENGINE

(Full deep-dive in `AI_SYSTEM_MAP.md §7.`) The engine is **real-dollar** throughout.

### Pipeline
`runSimulation(plan, overrides, returnPaths?)` → `resolveInputs` (plan+overrides →
flat inputs) → for each of N paths (`returnPaths` bundle or `generateReturnPath`),
`runSinglePath(inputs, path)` → `analyzeResults(sims, inputs)` → results object
(`successRate`, `terminal`, `envelope`, `paths`, `sims`, `metrics`,
`medianCagr`, `medianLifetimeTax`). `[CONFIRMED]`

### Return generation
**Block bootstrap:** repeatedly grab a contiguous **3–5-year** block of real
returns at a random start, concatenate to fill the horizon (`generateReturnPath`,
:491). Preserves real autocorrelation. RNG = **seeded mulberry32** (`DEFAULT_SEED
= 0x9e3779b9`) → reproducible; the only randomness in the engine.

### Per-year sim logic (pseudocode)
```
for each year (age = currentAge + y):
  r = realReturn(path[y], allocationWeights) + returnAdj
  if age < retirementAge:                       # ACCUMULATION
      portfolio *= (1+r); add savings (split across sleeves, mid-year factor)
      fund one-time lump + active goals by liquidation (taxable→trad→roth)
  else:                                          # RETIREMENT
      income   = SS(started) + otherIncome(real-grown,partly-taxed) + pension(real-eroded)
      expenses = (living+housing+debt)*spendMult + healthcare(own real growth)
                 + extras + goals + liabilities + lump + LTC(if age≥onset)
      taxOnIncome = 0.85*SS*ord + taxableOI*ord + pension*ord       # flat stub
      gap      = expenses − (income − taxOnIncome)
      funding  = fundGap(accounts, gap, taxRates, strategy)          # grossed-up withdrawals
      apply mid-year return + withdrawals per account; consume taxable basis pro-rata
      if age≥73: force RMD shortfall from traditional; reinvest after-tax into taxable(basis)
      if portfolio≤0 or shortfall: failed=true; record depletionAge
  emit per-year row (balance, withdrawal, income parts, taxes, rmd, per-account, …)
```

### Key formulas / assumptions `[CONFIRMED]`
- **SS actuarial** (`ssAdjust`, :129): FRA 67; late +8%/yr to 70; early −5/9%/mo
  (first 36mo) then −5/12%/mo; 62 = −30%.
- **spendMult** = `(1 − clamp(spendCut,0,.5)) · (1 + max(0,spendBump))`.
- **colaReal** = `colaPct/100 − LONGRUN_INFLATION(0.025)` (a 0%-COLA payment erodes
  in real terms).
- **RMD** = prior-year-end traditional ÷ `UNIFORM_LIFETIME[age]` from age 73; Roth
  exempt; excess reinvested after-tax as taxable basis.
- **Asset sale**: deterministic net proceeds = value(real→nominal) − commission −
  mortgage payoff − cap-gains(on nominal gain) − §121 exclusion, then deflated to
  today's $.
- **Mortgages**: amortized to a fixed-nominal annual payment, appended as a
  fixed-nominal liability.

### `analyzeResults` outputs
- `successRate`, `terminal` percentiles, **`envelope`** (per-year p10–p90; a
  boundary, not a path), **`paths.p50` = two-stage medoid** (central-by-outcome
  decile, then median volatility → a *typical bumpy* path for the cash-flow view),
  rich `metrics` (depletion age, min balance/drawdown among survivors, years
  underwater, above-start/doubled counts).

### Edge / failure cases `[CONFIRMED]` (`CODE_IMPROVEMENTS.md`)
- Non-positive horizon (planEnd ≤ current) → `cagr = x^(1/0)` risk (guarded in UI
  `runAll`, not in engine — see §12).
- `fundGap` basis denominator mis-tracks only under `proportional` (never set in
  UI → dead path).
- Goal/lump driving the portfolio negative mid-retirement → depletion path.

### Engine limitations
Flat tax stub (no brackets/deduction/IRMAA/state; SS flat 85%); no survivor SS
step-up; LTC flat real; cap-gains use average embedded gain; no §1250 recapture.
These are the targets of the planned tax engine + survivor model.

---

## SECTION 7 — BUSINESS RULES

(Each rule + WHY) `[CONFIRMED]`

| Rule | Why |
|---|---|
| Every Scenarios column runs through the **same `sharedPaths`** bundle | Apples-to-apples — any difference is the decision, not sampling luck (Doctrine #6) |
| Allocation change ⇒ **plan clone**, not an override | Allocation alters the whole weight vector; overrides can't express it (`planForScenario`) |
| Spending cut routes to `spendCut`, increase to `spendBump` | Engine ignores negative `spendBump`; a naive single-knob would silently no-op cuts (`leversToOverrides:1436`) |
| Pension benefit looked up by **exact** age; missing age = $0 | Never invent a number the advisor doesn't have (`engine.js:666`) |
| Pension auto-tracks retirement age until the slider is grabbed | Most people start a pension when they retire (`syncPension`) |
| `sellAge` emitted only when ≥ currentAge | Baseline must carry no sale so sell-vs-keep compares cleanly |
| Healthcare NOT scaled by the spend lever | Medical isn't discretionary lifestyle (`engine.js:752`) |
| Terminal wealth is a **rank device**, never the objective | Planning solves security/survival/goals, not "biggest pile" |
| Editing a base input **reseeds columns preserving each delta** | "Draw from base, then adjust" must hold (`reseedScenarios`) |
| Inputs are dedicated data-entry pages, not a live panel | RightCapital model; rejected the live-panel + status machinery |
| Goal-board priority rank feeds **no math** | Engine has no goal-priority lever — it's a conversation cue by design |
| No editorial sentences in the UI | The advisor narrates; the program shows truth (Principle #2) |
| At least one Sequencing market chip stays lit | A chart with zero lines is meaningless |
| Run uses a **fixed seed** | No ±1% success drift between identical clicks |

---

## SECTION 8 — USER FLOWS

`[CONFIRMED]`/`[INFERRED]` from render + verify logic.

1. **Enter/adjust the household plan.** Net Worth tab → Balance Sheet (accounts,
   real assets, liabilities), Cash Flow (income/expenses), Goals (priority board),
   Snapshot (gauges). Edits write to `plan` → invalidate `sharedPaths` →
   `reseedScenarios` → `runAll`. *Failure path:* plan-end ≤ current age → status
   "Check plan: end age must be after current age," last good results kept.
2. **Compare choices (Scenarios).** Adjust levers per column → Run → read % success
   circles + delta vs baseline; open the cash-flow drawer for a year-by-year view
   of the representative path. *Failure path:* a bad saved lever throws for one
   column only → that column `res=null`, others survive, status notes "N scenarios
   could not run."
3. **Stress sequence risk (Sequencing).** Pick a scenario in the dropdown, toggle
   market chips → each lit market draws a line from the shared retirement-balance
   entry; outcome cards show first-decade return / lowest balance / survived-$ or
   ran-dry-age.
4. **Solve-For (built v1).** Activate the solver, choose a named goal, free exactly
   one lever → bisection solve → writes a new scenario column with the solved lever
   filled. *Failure path:* if no value reaches the target within its band, it
   honestly shows the best % achievable.

---

## SECTION 9 — UI / UX SYSTEM

`[CONFIRMED]`

- **Layout:** flex column shell (`.wrap`), header (`.hdr`) + three `.page` panels
  toggled by `data-page`. Scenarios uses a CSS grid `148px repeat(N,1fr)` with the
  % band **sticky** at top while lever rows scroll; `syncGridCols()` keeps band /
  levers / foot column counts in sync.
- **Sub-nav:** Net Worth tab has 4 sub-pages (`SUB_PAGES`): statement / hybrid /
  board / snapshot layouts.
- **Spacing/grid:** 8px-grid pass applied (CSS); 64px atmospheric background grid.
- **Typography:** Sora (UI, letter-spaced uppercase eyebrows/labels), Inter
  (numbers). No monospace.
- **Component hierarchy:** floating glass cards (one `.solve-panel,.metric,
  .cf-drawer,…` glass rule) → eyebrow section heads with gradient underline → band
  cells (circle/levers/median) → lever rows (stepper or slider + value).
- **Navigation philosophy:** two-tab analysis (Scenarios/Sequencing) + an inputs
  tab; minimal, hero-number-always-visible.

**Works well:** the % circle + delta comparison; sticky band; sage-glass depth;
the cash-flow representative-path table; Sequencing real-markets story.
**Visual/UX debt (parked):** Scenarios 3-column repetition (shared-track redesign
parked); cash-flow retire-marker reads the base plan's age for every column (bug
#4); no hover/tooltip on charts yet; dead CSS (`.seq-stats`, `base-lock`).

---

## SECTION 10 — DESIGN LANGUAGE

**AUTHORITATIVE SOURCE = the running `:root` in `parallax_v2.html:10`.** (CLAUDE.md
theme prose is stale — see §16/§11.) Current theme = **"Sage Glass"** `[CONFIRMED]`:

- **Colors:** ground sage `#1e3d2b`/deep `#1a3526`; ink `#F4F6F0` (no bright
  white); accent **copper/clay `#D9A07E`** (bright `#E3B194`) — *no saturated
  orange*; teal `#8cc69e`; hero values "muted champagne" `#E5D9C4`. Result band:
  green `#7AA76C` (≥80%), bronze `#D8B371` (71–79%), sangria `#5E1916` (<71%).
- **Transparency / glass:** translucent sage surfaces
  (`rgba(170,210,180,.18)`), **`backdrop-filter: blur(16px) saturate(1.15)`**.
- **Borders / radius:** no hard borders — a whisper-faint inset ring + brighter top
  rim-light; cards rounded (band cells `14px 14px 0 0`).
- **Shadows / elevation:** `box-shadow:0 22px 48px -24px rgba(0,0,0,.55)` + inset
  rim highlights for lift.
- **Background:** layered radial glows + 64px grid + diagonal gradient.
- **Animations / motion:** ring fill `transition … cubic-bezier(.4,0,.2,1)`;
  goal-board drag/snap cubic-bezier; lever bars fill+dot.
- **Intended emotional response:** calm, premium, trustworthy *instrument* — not a
  fear calculator. Air, depth, one confident accent.
- **Rule:** green allowed, **no mint green**; no monospace; mock-first for visual
  changes.

---

## SECTION 11 — CURRENT STATE OF THE PROJECT

`[CONFIRMED]` (facts) vs *opinion* (italic).

**Complete:** engine (RMDs, savings split, mortgages, liabilities, asset sale,
typed accounts, timed income/expense/goal arrays); Scenarios tab (circles +
levers + cash-flow drawer); Sequencing tab (real markets + outcome cards); Net
Worth inputs (Balance Sheet / Cash Flow / Goals board / Snapshot); named/saveable
scenarios in localStorage; Solve-For v1; seeded reproducible MC.

**Partially complete:** Solve-For (solo-lever only; multi-variable solver is the
big planned evolution); account-types add-flow (mock built, awaiting OK — not
shipped); recurring liabilities (engine done, not fully wired to UI as a
base-vs-per-scenario construct).

**Broken / bugs (low-severity):** cash-flow retire-marker uses base plan's
retirement age for every column (CODE_IMPROVEMENTS #4 🔴); `sellAge` "Keep"
sentinel can flip to a sale if base `currentAge` is lowered (edge).

**Experimental / parked:** `aurora/` glass exploration; "Experience" fintech
direction; Scenarios shared-track redesign.

**Being redesigned / actively debated:** SS framing (weak % mover vs lifetime-
dollars); Solve-For solo-vs-combined display; liabilities base-plan vs
per-scenario; pension placement (Scenarios sub-mode?); whether to keep the
Scenarios hero line (it was removed per NOTES — *spec drift, verify in app*).

*Opinion:* the engine is solid and trustworthy; the highest-leverage next moves
are the tax engine and the explainable solver; the biggest correctness risk to a
real client number is the **flat tax stub + no survivor SS** (both disclosed).

---

## SECTION 12 — KNOWN BUGS

| Bug | Root cause | Files | Severity | Recommended fix |
|---|---|---|---|---|
| Cash-flow **retire-marker** wrong for non-baseline columns | Dashed retirement row uses base plan's retirement age, not the column's | `parallax_v2.html:~3074` | 🔴 real | Per-column marking, or drop the marker |
| `sellAge` "Keep" can flip to a sale | Lowering base `currentAge` pushes the `currentAge−1` sentinel past threshold; stored sentinel not migrated on rebuild | `parallax_v2.html:~1447` | 🟡 edge | Migrate sentinel on rebuild / clamp |
| Zero-horizon → `cagr = x^(1/0)` | `runSinglePath` doesn't guard horizon 0 | `engine.js:1127` | 🟡 latent | UI guards it in `runAll`; add an engine guard for direct callers |
| `fundGap` basis denominator | Uses unmutated start balance while basis decrements (only under `proportional`) | `engine.js:49` | 🟡 dead path | Divide by `workingBal[type]` if `proportional` is ever exposed |
| Build silent no-op | Strip/import regexes assume one match; reformat → silent broken ship | `build-standalone.mjs:12,17` | 🟡 latent | Assert `out !== html` and no `export ` survives |
| Verify ships "green" on runtime crash | Page/console errors are non-fatal | `scripts/verify.mjs:226` | 🟡 | Filter favicon 404s, fail on the rest; drive a lever + assert a number moved |

(There are **no known bugs producing wrong client-facing numbers** today — the tax
flatness and survivor-SS gaps are *disclosed simplifications*, not bugs.)

---

## SECTION 13 — TECHNICAL DEBT

`[CONFIRMED]` (from `CODE_IMPROVEMENTS.md`)

**HIGH**
- Lever surface is **~0% unit-tested** — ssDelayYears, riskProfile trade-off (the
  core "higher line / lower circle" thesis), savingsBump, taxMult, ssCut,
  returnAdj, initialShock, longevityYears, LTC, withdrawal strategies. Impact: the
  product's whole thesis is unverified by tests.
- Flat tax stub (overstates/understates real-client tax) — slated for replacement.
- No survivor SS step-up (overstates couples' late-life income).

**MEDIUM**
- `verify.mjs` only checks elements EXIST (never drives a lever / asserts a number);
  page errors non-fatal.
- `build-standalone.mjs` regex fragility (silent no-op risk).
- Cash-flow retire-marker bug (also in §12).
- Money-parse idiom hand-rolled ~8× → a `parseMoney()` helper would remove drift.

**LOW**
- Dead code: `smoothPath()` (superseded by `monoPath`), `.seq-stats` CSS, unwired
  `expense`/`expenses.extra` row kind, inert `base-lock` class, duplicate comment.
- `ASSET_STATS[k].mean` computed but unused.
- Stale skill docs (say 13/27 tests; actual 38) + wrong screenshot names in
  `verify/SKILL.md`.
- `ringColor` thresholds re-inlined in `renderBand` (two copies that can drift).
- No content-hash check that built files match `parallax_v2.html`.

---

## SECTION 14 — FUTURE ROADMAP

(Full detail in `AI_PRODUCT_MEMORY.md §8` and `ROADMAP.md`.)

**NEXT / BIG:** progressive **Tax Engine** (own pure `tax.js` module + `tax.test.js`;
explicitly agreed with Nathan; open DECIDEs on fidelity tier / filing status /
bracket basis / Roth conversions / SS tiers) · **Explainable constraint solver**
(multi-variable Pareto set, auditable replay) · **Decision Surface heatmap**
(retire-age × spend, confidence contours) · **Solve-For palette** (named life
questions, one free lever).

**Low-lift VIEWS of existing truth:** Failure Anatomy (best ROI) · Scenario Receipt
· Funding Bridge · honest derived tiles · Sequence Pressure Strip · Rolling-period
analysis · captured-hover chart interaction · delta pill.

**Engine gaps (parked):** survivor SS step-up · healthcare scaling independence ·
LTC escalation · one-time INFLOW (downsizing) · real assets · §121 exclusion ·
taxClass on income · income-stream COLA · sustainable-withdrawal solve.

**REJECTED / do-not-relitigate:** dark navy "Midnight Analyst" theme · reversed-
sequence view (killed twice) · allocation as a solo solve lever · Desired Legacy
lever · probability fan / bar charts on Scenarios · cash-flow Sankey · Resilience
Matrix as a new tab · rebrand · pension COLA mode dropdown · stale/needs-review
input machinery.

**Deferred design:** "Experience" fintech direction · Scenarios shared-track
redesign · two-tier nav · comprehensive read-only plan view · prospect tier ·
investment comparisons.

---

## SECTION 15 — DEVELOPMENT WORKFLOW

`[CONFIRMED]`

- **Local dev:** edit `parallax_v2.html` (imports `engine.js`). To run from
  `file://` you must build first (module imports are blocked on `file://`), or
  serve the folder. The `/verify` probe serves on :8765.
- **Build:** `node build-standalone.mjs` → regenerates `index.html` +
  `parallax.html` (engine inlined). **Always commit the built files** (Pages serves
  them).
- **Test:** `node --test engine.test.js` (38 tests, must all pass) — or the
  `engine-guard` skill after any engine change.
- **Visual verify:** `node scripts/verify.mjs` → builds, tests, screenshots every
  page to `verify-out/`. **Run before claiming any visual task done.**
- **Git / branches:** work on a `claude/*` feature branch; **GitHub Pages serves
  `main`** so the `/ship` skill pushes to BOTH (reconcile with main FIRST; NEVER
  force-push main). A Stop hook nags if the branch is ahead of `origin/main`.
- **CI:** `test.yml` runs engine tests on push/PR; `build-pages.yml` auto-rebuilds
  the standalone on push and commits it back with `[skip ci]`.
- **Deploy:** push to `main` → Pages updates https://t66wwpvthy-prog.github.io/Parallax/

> **Current branch fact:** the working branch is even with `origin/main`; remote
> has only `main` + the working branch. CLAUDE.md's `claude/laughing-einstein-*`
> canonical-branch name is historical (not on this remote). Deploy target = `main`.

---

## SECTION 16 — PROJECT MEMORY

(Full lessons in `AI_PRODUCT_MEMORY.md §9–10.`) The non-negotiables, distilled:

1. **Logic checks lie; pixels don't.** The cash-flow drawer shipped at 2px tall for
   ~10 messages. Run verify, LOOK at screenshots.
2. **Never optimize CSS for elegance** — a property-merge silently reordered the
   cascade and shipped (false-passed verification). Faithful-and-ugly wins.
3. **The deterministic comparison is intentional** — don't simplify Scenarios back
   to a sampled path; sequence risk is Sequencing's job. (`sharedPaths` enforces.)
4. **Mock-first for visual changes** — a dark theme shipped, was rejected; a 5-min
   mock would have caught it.
5. **Push to both branch and main; never force-push main** — a force-push once
   silently reverted the Goals board + healthcare work.
6. **Confirm before deleting** — a tab named `sequence` was NOT the cash-flow
   table; the ledger lived in `playback`.
7. **Await async completion before asserting** — a "still off" reading was a test
   race.
8. **The engine is provenance-verified and sacred** — protect it; don't "fix"
   verified-correct code (RMD timing, SS schedule).

**Surprising discoveries:** the engine's only randomness is two seeded `rand()`
calls; the p50 cash-flow path is a deliberate two-stage medoid (not the literal
median); a 0%-COLA payment correctly *erodes* in a real-dollar engine.

**Arc:** bloated multi-tab tool → judged "a PowerPoint of nothing" → stripped to
the engine → deliberate rebuild (Net Worth + Scenarios + Sequencing) → next:
tax engine + explainable solver.

---

## SECTION 17 — AI CONTINUATION GUIDE

**How to think about the product.** It is a **truth instrument for advisors**, not
a calculator. Neutrality is the feature. The engine is the truth; the UI only
*views and levers* it. Subtraction is the default — when tempted to add a
tab/view/concept, say so instead of doing it.

**Priorities that matter most.** (1) Never break the engine or its tests. (2) Never
re-derive a number in the UI. (3) Keep Scenarios apples-to-apples (shared paths).
(4) Verify visual work by pixels. (5) Keep the live site (`main`) in sync.

**What NOT to accidentally change.** The `:root` sage-glass theme (don't "modernize"
it without a mock + approval); the seeded RNG / shared-paths reproducibility; the
deterministic comparison; the discrete pension lookup (no interpolation); the
"healthcare not spend-scaled" rule; the no-editorial-prose rule.

**Verify before editing.** Read the **running `:root`** for the real theme (not
CLAUDE.md prose). Read the actual render functions for the current Scenarios layout
(the hero line may be gone). Run `node --test engine.test.js` and `node
scripts/verify.mjs` to see green before AND after.

**How to evaluate success.** A change is successful when: engine tests still pass;
verify exits 0 and the **screenshots look right**; no number is re-derived in the
UI; the change *subtracts or clarifies* rather than bloats; and it would survive
Nathan looking at it and saying "that's right." Report back in the **3-line
format** (what changed / what to check / decisions needed).

**Working with Nathan.** "Mate" or nothing, never "buddy." Short. No guessing — say
"I can't verify that" rather than bluff. Confirm before anything destructive.

---

## SECTION 18 — APPENDIX

### Key constants `[CONFIRMED]`
```
LONGRUN_INFLATION = 0.025         RETURN_DATA: 1928–2025 (98 yrs, real)
SS_FRA = 67                       Block bootstrap: 3–5 year blocks
RMD_START_AGE = 73                DEFAULT_SEED = 0x9e3779b9 (mulberry32)
iterations = 1000                 RISK_PROFILES 1..6 (UI exposes 1..5)
EQUITY_MIX: usLarge.50 usSmall.10 intlDev.22 emerging.08 reit.10
DEFENSIVE_MIX: usBonds.75 cash.17 gold.08
taxes (stub): ordinary 22%, capitalGains 15%   SS taxed at flat 85%
Result band: ≥80% green #7AA76C · 71–79% bronze #D8B371 · <71% sangria #5E1916
```

### Engine public API (exports, `engine.js:1362`)
```js
RETURN_DATA, ASSET_META, ASSET_KEYS, EQUITY_MIX, DEFENSIVE_MIX, RISK_PROFILES,
ASSET_STATS, LONGRUN_INFLATION, buildAssetWeights, computeAssetStats,
generateReturnPath, resetSeed, weightedAssetReturn, runSimulation, resolveInputs,
runSinglePath, analyzeResults, runHistoricalPath, annualMortgagePayment,
plan as defaultPlan
```

### Override surface (understood by `resolveInputs`)
`retireDelay, ssDelayYears, spendBump/spendCut, lumpSum + lumpSumYear,
savingsBump, savingsSplit, pensionStartAge (+legacy pensionDelay), assetSale
{asset,age}, saleExclusion, initialShock, returnAdj, taxMult, ssCut,
healthcareAdj, longevityYears, ltcAdj`. (Allocation/riskProfile needs a plan
clone, NOT an override.)

### Results object shape
`{ successRate, survived, total, terminal{p10..p90}, envelope[{year,p10..p90}],
paths{p10,p25,p50(medoid),p75,p90}, sims[], metrics{…}, medianCagr,
medianLifetimeTax, horizonYears, iterations, params }`

### Dependencies
Runtime: **none** (vanilla). Dev: `puppeteer`, `playwright` (verify probe only).
Fonts via Google Fonts CDN (Sora, Inter).

### Environment / deploy
No runtime env vars. `verify.mjs` honors `PUPPETEER_EXECUTABLE_PATH` and a pinned
container Chromium path. GitHub Pages serves `main`; `.nojekyll` present.

### Glossary
- **Block bootstrap** — Monte Carlo that resamples contiguous *blocks* of real
  history (preserving autocorrelation), not IID single years.
- **Envelope** — per-year p10–p90 band of balances across sims; a boundary, not a
  walkable path.
- **Medoid (p50 path)** — the representative cash-flow path: most-central-by-
  outcome decile, then median return-volatility within it.
- **PIA** — Primary Insurance Amount: SS benefit at Full Retirement Age (today's $).
- **Real-dollar** — inflation-adjusted; the engine's native unit.
- **Sequence-of-returns risk** — the danger of bad early-retirement returns while
  withdrawing; the whole point of the Sequencing tab.
- **Shared paths** — one MC bundle reused across all Scenarios columns + repeated
  Runs, so differences are decisions, not luck.
- **Solve-For** — running the engine "in reverse": fix everything, free one lever,
  solve for the value that hits a goal.
- **The truth source** — `engine.js`. The UI never re-derives a number.

---

*End of master. For deeper technical detail see `AI_SYSTEM_MAP.md`; for vision,
design, and lessons see `AI_PRODUCT_MEMORY.md`. All three were written from a
direct read of the source on 2026-06-07.*
</content>
