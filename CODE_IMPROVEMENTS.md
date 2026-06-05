# CODE IMPROVEMENTS — banked audit findings

Banked from a full code audit (engine, UI, tests, build, tooling) on 2026-06-04.
**Nothing here is broken or shipping wrong numbers.** These are safety-net gaps,
dead code, and disclosures — parked, not in-flight. Every serious claim was
verified against the actual code (false positives are marked so we don't relearn).

Severity: 🔴 real bug · 🟡 latent/edge · ⚪ cleanup/nit · 📋 disclosure (by design) · ✅ verified correct (do not "fix")

---

## Ranked fix list (when we pick this up)

| # | Item | Effort | Severity |
|---|------|--------|----------|
| 1 | Test the lever surface — SS-delay, allocation trade-off, stress knobs (core thesis is 0%-tested) | medium | 🟡 |
| 2 | Harden `verify.mjs` (drive a lever, assert a number moved, fail on real page errors) | low | 🟡 |
| 3 | Harden `build-standalone.mjs` regexes (assert substitutions happened) | low | 🟡 |
| 4 | Cash-flow retire-marker reads base plan — wrong for non-baseline columns | low | 🔴 |
| 5 | Delete dead code (`smoothPath`, orphan CSS, unwired row kind) | trivial | ⚪ |
| 6 | Fix stale skill-doc test counts (say 27/13, actual 38) + wrong screenshot names | trivial | ⚪ |
| 7 | DECISION: model couples survivor-SS step-up (only simplification with real client impact) | medium | 📋 |

---

## Engine — financial correctness (`engine.js`)

### ✅ Verified correct — DO NOT "fix" these
- **RMD timing (`1024`, `1050`)** — a reviewer flagged this as "critical: wrong balance."
  **FALSE POSITIVE.** At the top of each year's loop, `accounts.traditional.balance`
  is the prior-Dec-31 balance (untouched this iteration). `tradStartBal / rmdDivisor(age)`
  = prior-year-end ÷ current-age divisor — exactly the IRS rule. Applying `(1+r)` would
  be *wrong*. No change needed.
- SS actuarial schedule (`129–136`): 62 = 30% cut, 70 = +24%, FRA 67 neutral. Matches SSA.
- Pension discrete age-lookup, no interpolation (`666`). Per-stream income growth +
  taxable-share (`957–963`, `986`). Pre-retirement goal charging (`918–930`).
  lumpSum debits both phases (`912`, `992`). Mortgage payoff + real/nominal bridge
  (`699–708`). RMD excess reinvested as pure-basis taxable (`1056–1058`). Block
  bootstrap + seeded RNG.

### 🟡 Real but latent
- **`fundGap` basis denominator (`49`)** — `basisPortion = workingBasis / accounts.taxable.balance`
  uses the unmutated start balance while `workingBasis` is decremented. Mis-tracks basis
  only when `drawFrom('taxable')` runs twice in one call — which only happens under the
  **`proportional`** strategy. **That strategy is never set in the UI** (always
  `taxable-first`). Dead path. Fix if we ever expose proportional: divide by `workingBal[type]`.

### 📋 Design simplifications to DISCLOSE to clients (not bugs)
- **Couples: no survivor-SS step-up** — both spouses' benefits run the full horizon;
  real household SS drops at first death. **Most material — overstates late-life income
  for married households.** Candidate for a real model change (item 7).
- SS taxed at a flat 85% of every dollar (`985`) — ignores provisional-income thresholds;
  over-taxes lean plans.
- Single blended ordinary + cap-gains rate, no brackets / standard deduction / IRMAA
  (`813–816`). By design (advisor sets one effective rate).
- Rental sales miss §1250 depreciation recapture (up to 25%) — taxed as plain LTCG.
- Taxable cap-gains use the *average* embedded gain, not lot-level / HIFO.

---

## UI / app code (`parallax_v2.html`)

### 🔴 Real bugs
- **Cash-flow retire-marker (`3074`)** — the dashed "retirement" row uses the BASE plan's
  retirement age for every column. Any scenario that moves the retirement-age lever (the
  common case) gets the marker at the wrong age. It's one full-width row, so the honest
  fix is per-column marking or dropping the marker.
- **`sellAge` "Keep" can flip to a sale (`1447`)** — lowering base `currentAge` on the
  Balance Sheet can push a scenario's "Keep" sentinel (`currentAge−1`) past the threshold,
  silently turning it into "sell at age X." `levRange` re-clamps the slider on rebuild but
  the stored sentinel isn't migrated. Edge case.

### ⚪ Dead code (safe to delete)
- `smoothPath()` (`2993`) — confirmed zero call sites; superseded by `monoPath()`.
- `.seq-stats` orphan CSS (`623`). Unwired `expense` / `expenses.extra` row kind (`1768`) —
  no add-affordance renders it; gutter totals ignore it. Inert `base-lock` class (`2692`) —
  no CSS, no JS reads it; baseline slider isn't actually locked. Duplicate comment (`1081`).

### ⚪ Consistency / nits
- `ringColor` thresholds re-inlined in `renderBand` (`2575`) instead of calling the helper —
  two copies that can drift.
- Money-parse idiom `parseFloat(String(x).replace(/[^0-9.]/g,''))` hand-rolled ~8× with
  subtly different clamping — a `parseMoney()` helper would remove drift risk.
- `LEVCFG` pension min/max (55–70, `2480`) is never the effective range (`levRange` returns
  quoted ages) — misleading dead config.
- Four CSS grids hardcode `repeat(3,1fr)` (`84/204/241/249`) but `syncGridCols()` overrides
  all four inline at runtime. **Verified all four stay in sync.** Risk is only that a 5th
  grid surface added later could forget the `syncGridCols` list. Consider a CSS custom prop.
- `renderScenGoals` filters `amount>0` (`2711`) — a $0 goal vanishes from the scenario
  mirror while still showing on the Goals page. Intended ("quiet reflection"), noted.

### ✅ Recent additions reviewed clean
`renderScenGoals` / `#scn-goals`, cash-flow lumpSum+goals columns, income gpct/pct inputs,
assetSale lever — no bugs beyond the retire-marker above.

---

## Tests & tooling

### 🟡 The real gap — lever surface is ~0% tested
Data-model overrides (pension, sale, income, goals, RMD, savings split) ARE tested.
These have **no test** and are exactly what Scenarios/Sequencing drive:
- `ssDelayYears` + the whole `ssAdjust` actuarial schedule
- `riskProfile` — the "higher expected line, LOWER success circle" trade-off (the core thesis)
- `savingsBump`, `taxMult`, `ssCut`, `returnAdj`, `initialShock`, `longevityYears`
- LTC sleeve (`ltc.amount`, `onsetAge`, `ltcAdj`)
- `proportional` + `traditional-first` withdrawal strategies (2 of 3 never run)
- retirement-phase `lumpSum` (only accumulation-phase tested)
- `saleExclusion` / §121 (code path exists, never exercised)
- `resetSeed` reproducibility (current test supplies a pre-built bundle, so it never
  actually tests that `resetSeed()` makes paths deterministic)

### 🟡 Edge cases untested
- Zero horizon (`currentAge===planEndAge`) → `cagr = x^(1/0)` → plausible NaN/Infinity. Guard it.
- Goal/lump that drives the portfolio negative mid-retirement (failure/depletionAge path).
- Sale of out-of-range asset index (no-ops today via guard, but never asserted).
- `saleAge < currentAge`, `pia:0`, `runHistoricalPath` with invalid `startYear` (returns null).

### 🟡 `verify.mjs` only checks elements EXIST
- Never drives a lever, never clicks Run, never asserts a number changed — the product's
  whole thesis (levers move circles) is visually unverified.
- Page/console errors are explicitly **non-fatal** — a real runtime crash ships green.
  Filter favicon 404s, fail on the rest.
- Only the default render is captured (no multi-column scenario, no sequencing outcome cards).

### 🟡 Build integrity (`build-standalone.mjs`)
- Strip regex `/export\s*\{[\s\S]*?\};?\s*$/m` and the import-replace both assume exactly one
  match. If those lines ever reformat, the substitution **silently no-ops** and ships a
  broken file while printing success. Assert `out !== html` and that no `export ` survives.
- No content-hash check that `index.html`/`parallax.html` match the current `parallax_v2.html`.

### ⚪ Tooling / docs
- Skill docs state stale counts: `engine-guard` says "13 tests"/"27/27", `ship` says "27/27".
  **Actual is 38.** Erodes the no-guessing contract.
- `verify/SKILL.md` lists wrong screenshot filenames (says `01-scenarios.png` etc; probe
  writes `01-balance-sheet`, `03-scenarios`, `04-cashflow`, `05-sequencing`, `06-property`).
- `/ship`'s no-force-push-main rule is prose-only — a pre-push hook rejecting non-fast-forward
  `main` would make it structural.
- No CI runs the suite on push — the whole safety net depends on remembering to run `/verify`.
