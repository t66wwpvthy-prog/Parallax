# T4 planner adapter handoff

**Branch:** `feat/tax-t4-planner-adapter`  
**Base:** `main` @ `4467a92` (T1 #80 + T2 #81 + T3 #82 + T4.1 #83 + T4.2 #84 merged)  
**Validation:** `npm test` + `verify.mjs` (adapter may affect typical-path attach)

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

**Gain fraction (T4.3) — in progress (PR #86)**

- Engine exposes read-only `row.taxableGainFraction` at start-of-year when taxable withdrawals occur
- Adapter consumes row fact via `buildRowTaxableGainPlanMeta` (no duplicated basis replay)
- Static starting-basis fraction removed from `buildPlanMetaFromEngineParams`; explicit override still supported
- Empty-then-funded: engine reports `0` gain fraction once RMD-funded taxable is withdrawn

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
| Zero-income years | Empty income rejected | One bad year aborts whole path |

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
3. **Gain fraction** — engine row fact + adapter consume (T4.3 PR #86)
4. **Zero-income / failed years** — deterministic skip or empty-year handling (no path abort)
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

- [ ] Filing status from household flows to sidecar (not hardcoded MFJ)
- [ ] Typical-path attach completes on benchmark-like scenario without silent MFJ default
- [ ] Zero-income retirement year does not abort entire path
- [ ] `npm test` — all pass
- [ ] `node scripts/verify.mjs` — passes (UI smoke)
- [ ] No tax rule math added to `ui/*` or `engine.js` (adapter/glue only)

## Benchmark reminder

annual-08 authoritative fixture remains the tax-module truth test. T4 validates **planner → tax** wiring on realistic engine rows, not just standalone fixtures.
