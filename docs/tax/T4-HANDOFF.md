# T4 planner adapter handoff

**Branch:** `feat/tax-t4-planner-adapter`  
**Base:** `main` @ `608bea6` (T1 #80 + T2 #81 + T3 #82 merged)  
**Validation:** `npm test` + `verify.mjs` (adapter may affect typical-path attach)

## Goal

Make every planner year deliver **correct filing status and traceable tax facts** without silent assumptions or path-wide aborts.

The federal tax **rules** are largely ready for benchmark returns. T4 connects **engine rows → tax input** so the sidecar uses real facts instead of defaults.

## Known adapter gaps (from inventory)

| Planner fact | Current handling | Consequence |
|--------------|------------------|-------------|
| Filing status | Defaults to MFJ in `buildPlanMetaFromEngineParams` | Single/HoH/MFS taxed as MFJ |
| Social Security | Gross benefit → line 6a; no worksheet | Taxable SS effectively $0 |
| Taxable-account gain | Static gain fraction from starting basis | Ignores basis depletion |
| Empty taxable account | No gain fraction created | Later withdrawals can abort attach |
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
- `src/planning/tax/attachTypicalPathFederalTax.js`
- `src/planning/tax/runTaxForScenarioPath.js`
- `engine.js` (row output facts only — no tax math)

## T4 work items (prioritized)

1. **Filing status** — pass household status from planner to `planMeta` / attach
2. **Social Security** — supply worksheet facts or resolved taxable 6b from engine rows
3. **Gain fraction** — dynamic basis / reinvested RMD handling; no throw on empty-then-funded taxable
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
