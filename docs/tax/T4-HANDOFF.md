# T4 planner adapter handoff

**Branch:** `feat/tax-t4-planner-adapter`  
**Base:** `main` @ `a532f14` (T1–T3 + T4.1–T4.3 merged)
**Validation:** 184 tests passing + `verify.mjs` passed

## Goal

Make every planner year deliver **correct filing status and traceable tax facts** without silent assumptions or path-wide aborts.

The federal tax **rules** are largely ready for benchmark returns. T4 connects **engine rows → tax input** so the sidecar uses real facts instead of defaults.

## Status

**Filing status (T4.1) — complete**

- `main.js` passes `p.meta.filingStatus` into attach
- `buildPlanMetaFromEngineParams` reads `options.filingStatus` → `params.meta.filingStatus` → throws if missing
- Silent MFJ default removed

**Social Security worksheet (T4.2) — complete**

- `engineYearTo1040Input` builds `intake.socialSecurity` when gross SS > 0
- Line 6b calculated by `FED_TAXABLE_SOCIAL_SECURITY`
- Resolved `taxableSocialSecurity` / `taxableSS` bypasses worksheet
- MFS requires explicit `livedWithSpouse`
- 176 tests passing; `verify.mjs` passed

**Gain fraction (T4.3) — complete**

- Engine exposes read-only `row.taxableGainFraction` at start-of-year when taxable withdrawals occur
- Adapter consumes row fact via `buildRowTaxableGainPlanMeta` (no duplicated basis replay)
- Static starting-basis fraction removed from `buildPlanMetaFromEngineParams`; explicit override still supported
- Empty-then-funded: engine reports `0` gain fraction once RMD-funded taxable is withdrawn

**Zero-income and failed years (T4.4) — complete**

- Explicit `income: {}` runs the full 1040 spine and calculates line 24 as `$0`
- The real depletion/failure year remains in the annual results
- Post-depletion filler rows (`failed: true`, `source: null`) are skipped without aborting the path

## Remaining T4 gaps

| Planner fact | Current handling | Consequence |
|--------------|------------------|-------------|
| Filing status | ~~Defaults to MFJ~~ | **Fixed T4.1** — passes from household `plan.meta` |
| Social Security | ~~Gross only, line 6b = $0~~ | **Fixed T4.2** — worksheet drives line 6b |
| Taxable-account gain | ~~Static gain fraction from starting basis~~ | **T4.3** — `row.taxableGainFraction` from engine |
| Empty taxable account | ~~No gain fraction created~~ | **T4.3** — engine fact; attach no longer aborts |
| Traditional withdrawals/RMDs | Assumed 100% taxable | Nondeductible basis lost |
| Pension / other income | `taxablePct` discarded | Wrong taxable amounts |
| Interest/dividends | Not on planner rows | Lines 2b/3a/3b absent |
| Asset sales | `row.assetSale` ignored | Sale gain not reconstructed |
| Age | Dropped | Blocks age-based rules |
| Deductions | Standard assumed | No itemized from plan |
| Zero-income years | ~~Empty income rejected~~ | **Fixed T4.4** — explicit empty income calculates a `$0` return |
| Failed filler rows | ~~Sent through annual tax runner~~ | **Fixed T4.4** — skipped while the real failure year remains |

## Key files

- `src/tax/adapters/engineYearTo1040Input.js`
- `src/planning/tax/buildPlanMetaFromEngineParams.js`
- `src/planning/tax/taxableBasisTracker.js`
- `src/planning/tax/attachTypicalPathFederalTax.js`
- `src/planning/tax/runTaxForScenarioPath.js`
- `engine.js` (row output facts only — no tax math)

## T4 work items (prioritized)

1. ~~**Filing status**~~ — done (T4.1)
2. ~~**Social Security**~~ — done (T4.2)
3. ~~**Gain fraction**~~ — done (T4.3)
4. ~~**Zero-income / failed years**~~ — done (T4.4)
5. **taxablePct** on other income streams
6. Tests for representative MFJ, single, SS, RMD, survivor cases

## Out of scope (T4)

| Item | Phase |
|------|-------|
| NIIT rule calculation | T3+ |
| Cash Flow UI scope label | T5 |
| Replacing engine `row.taxes` as truth | T6 gate |
| New federal tax rules | unless adapter exposes missing fact |

## Success criteria

- [x] Filing status from household flows to sidecar (not hardcoded MFJ)
- [x] Typical-path attach completes on benchmark-like scenario without silent MFJ default
- [x] Zero-income retirement year does not abort entire path
- [x] `npm test` — 184 pass
- [x] `node scripts/verify.mjs` — passes (UI smoke)
- [x] No tax rule math added to `ui/*` or `engine.js` (adapter/glue only)

## Benchmark reminder

annual-08 authoritative fixture remains the tax-module truth test. T4 validates **planner → tax** wiring on realistic engine rows, not just standalone fixtures.
