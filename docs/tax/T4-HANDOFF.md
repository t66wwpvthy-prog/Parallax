# T4 planner adapter handoff

**Branch:** `feat/tax-t4-planner-adapter` (continue on same branch)  
**Base:** `main` @ `33a7cd4` (T1–T3 + T4.1 #83 + T4.2 #84 + T4.3 #86 + T4.4 #87 merged)  
**Validation:** `npm test` (184 baseline) + `verify.mjs`

## Goal

Make every planner year deliver **correct filing status and traceable tax facts** without silent assumptions or path-wide aborts.

The federal tax **rules** are largely ready for benchmark returns. T4 connects **engine rows → tax input** so the sidecar uses real facts instead of defaults.

## Status

**Filing status (T4.1) — complete** (#83)

- `main.js` passes `p.meta.filingStatus` into attach
- `buildPlanMetaFromEngineParams` reads `options.filingStatus` → `params.meta.filingStatus` → throws if missing
- Silent MFJ default removed

**Social Security worksheet (T4.2) — complete** (#84)

- `engineYearTo1040Input` builds `intake.socialSecurity` when gross SS > 0
- Line 6b calculated by `FED_TAXABLE_SOCIAL_SECURITY`
- Resolved `taxableSocialSecurity` / `taxableSS` bypasses worksheet
- MFS requires explicit `livedWithSpouse`

**Gain fraction (T4.3) — complete** (#86)

- Engine exposes read-only `row.taxableGainFraction` at start-of-year when taxable withdrawals occur
- Adapter consumes row fact via `buildRowTaxableGainPlanMeta` (no duplicated basis replay)
- Static starting-basis fraction removed from `buildPlanMetaFromEngineParams`; explicit override still supported
- Empty-then-funded: engine reports `0` gain fraction once RMD-funded taxable is withdrawn
- Tests cross-check `taxableGainFraction` vs `taxBySource.taxable / (withdrawal × capGainsRate)`

**Zero-income and failed years (T4.4) — complete** (#87)

- Explicit `income: {}` runs the full 1040 spine and calculates line 24 as `$0`
- The real depletion/failure year remains in the annual results
- Post-depletion filler rows (`failed: true`, `source: null`) are skipped without aborting the path

## Remaining T4 gaps

| Planner fact | Current handling | Consequence |
|--------------|------------------|-------------|
| Filing status | ~~Defaults to MFJ~~ | **Fixed T4.1** |
| Social Security | ~~Gross only, line 6b = $0~~ | **Fixed T4.2** |
| Taxable-account gain | ~~Static / replayed basis~~ | **Fixed T4.3** — `row.taxableGainFraction` |
| Empty taxable account | ~~No gain fraction~~ | **Fixed T4.3** |
| Zero-income years | ~~Empty income rejected~~ | **Fixed T4.4** |
| Failed filler rows | ~~Sent through tax runner~~ | **Fixed T4.4** |
| **Other income taxablePct** | **Gross on row; pct discarded** | **T4.5** — federal line 8 overstates partially tax-free streams |
| Traditional withdrawals/RMDs | Assumed 100% taxable | Nondeductible basis lost |
| Pension / other income | Pension assumed 100% taxable | May overstate if plan adds pct later |
| Interest/dividends | Not on planner rows | Lines 2b/3a/3b absent |
| Asset sales | `row.assetSale` ignored | Sale gain not reconstructed |
| Age | Dropped | Blocks age-based rules |
| Deductions | Standard assumed | No itemized from plan |

## Key files

- `src/tax/adapters/engineYearTo1040Input.js` — `mapSimulationRowToYearFacts`
- `src/planning/tax/runTaxForScenarioPath.js`
- `src/planning/tax/attachTypicalPathFederalTax.js`
- `src/planning/tax/buildPlanMetaFromEngineParams.js`
- `src/planning/tax/taxableBasisTracker.js`
- `engine.js` — row facts (`taxableGainFraction`, `otherIncome`, `taxBySource`)

---

## T4.5 — Other income `taxablePct` (NEXT SLICE)

**One phase = one PR.**

### Problem

Household plans allow per-stream `taxablePct` (0–1) on other-income entries. The engine:

- Computes `oiTaxable = sum(amt × taxablePct)` for engine `taxBySource.oi`
- Pushes **gross** `row.otherIncome = oiInc` on each simulation row

The adapter maps gross to Form 1040:

```javascript
if(row.otherIncome > 0) income.otherIncome = row.otherIncome;
```

Federal attach therefore taxes the **full gross** on line 8, ignoring `taxablePct`. Partially tax-free streams (e.g. 50% taxable disability) overstate AGI and line 24.

### Architecture constraint (from T4.3 review)

Do **not** recompute `taxablePct` weighting in the adapter from `params.otherIncome` — that duplicates engine truth and will drift.

**Preferred:** expose a read-only engine row fact (e.g. `row.otherIncomeTaxable`) computed alongside `oiTaxable`, then consume it in `mapSimulationRowToYearFacts`.

**Alternative (adapter-only, weaker):** pass `otherIncomeTaxable` via `planMeta.resolved` in tests only — not acceptable for typical-path attach without an engine fact.

### Desired behavior

- When `row.otherIncome > 0`, federal intake uses the **taxable portion** on line 8 (and SS worksheet `otherIncome` add-back if applicable)
- When `taxablePct === 1` (default), behavior unchanged from today
- When `taxablePct < 1`, federal line 24 is lower than gross-only mapping
- Cross-check test: `row.otherIncomeTaxable` aligns with `taxBySource.oi / ordinaryRate` (same pattern as T4.3 gain fraction)

### Implementation sketch

1. **`engine.js`** — on retirement rows with `oiInc > 0`, add `otherIncomeTaxable: oiTaxable` (read-only fact; no new tax math)
2. **`mapSimulationRowToYearFacts`** — prefer `row.otherIncomeTaxable` when present; fall back to `row.otherIncome` for back-compat fixtures
3. **Tests** — `engine.test.js` or planning test with `taxablePct: 0.5`; adapter + attach integration; regression on default 100% taxable

### Out of scope (T4.5)

- Pension `taxablePct` (not in engine today — separate slice if added)
- Interest/dividends on planner rows
- UI changes
- New federal tax rules

### Tests to add

- [ ] Engine row exposes `otherIncomeTaxable` matching internal `oiTaxable`
- [ ] `taxablePct: 0.5` stream → federal line 8 is half of gross `row.otherIncome`
- [ ] `attachTypicalPathFederalTax` completes; line 24 lower than gross-only baseline
- [ ] `taxablePct: 1` (default) unchanged
- [ ] `npm test` — 184+ baseline; `verify.mjs`

---

## T4 work items (prioritized)

1. ~~**Filing status**~~ — done (T4.1)
2. ~~**Social Security**~~ — done (T4.2)
3. ~~**Gain fraction**~~ — done (T4.3)
4. ~~**Zero-income / failed years**~~ — done (T4.4)
5. **taxablePct on other income** — **active (T4.5)**
6. Integration tests for representative MFJ, single, SS, RMD, survivor cases
7. Remaining gaps: traditional nondeductible basis, asset sales, age, itemized deductions

## Out of scope (T4)

| Item | Phase |
|------|-------|
| NIIT rule calculation | T3+ |
| Cash Flow UI scope label | T5 |
| Replacing engine `row.taxes` as truth | T6 gate |
| New federal tax rules | unless adapter exposes missing fact |

## Success criteria (T4 overall)

- [x] Filing status from household flows to sidecar (not hardcoded MFJ)
- [x] Typical-path attach completes on benchmark-like scenario
- [x] Taxable gain fraction from engine row facts
- [x] Zero-income retirement year does not abort entire path
- [x] Post-depletion filler rows skipped; real failure year retained
- [ ] Other-income `taxablePct` reflected on federal line 8
- [x] `npm test` — 184 pass
- [x] `node scripts/verify.mjs` — passes

## Benchmark reminder

annual-08 authoritative fixture remains the tax-module truth test. T4 validates **planner → tax** wiring on realistic engine rows, not just standalone fixtures.

## GPT session opener (T4.5)

```
PARALLAX TAX T4.5 — read docs/tax/GPT-TAX-WORKFLOW.md and docs/tax/T4-HANDOFF.md
Worktree: C:\Dev\Parallax\.worktrees\Parallax-tax-t4
Branch: feat/tax-t4-planner-adapter (NOT feat/household-wizard)
Base: main @ 33a7cd4 (T4.1–T4.4 merged)
Tests: npm test (184 baseline) + verify.mjs
Scope: T4.5 — other-income taxablePct via engine row fact + adapter; no UI, no new federal rules
```
