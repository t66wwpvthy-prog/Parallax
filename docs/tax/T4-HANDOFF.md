# T4 planner adapter handoff

**Branch:** `feat/tax-t4-planner-adapter` (continue on same branch)  
**Base:** `main` @ `d9360c5` (T1–T3 + T4.1 #83 + T4.2 #84 + T4.3 #86 + T4.4 #87 merged; T4.5 PR pending)  
**Validation:** `npm test` (187 baseline) + `verify.mjs`

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

**Other-income taxable share (T4.5) — complete**

- Engine retirement rows expose `otherIncomeTaxable` from the existing `oiTaxable` calculation
- Adapter maps the taxable portion to Form 1040 line 8 and the Social Security worksheet
- Older rows without the fact retain gross `otherIncome` as a compatibility fallback
- Default `taxablePct: 1` behavior is unchanged

## Remaining T4 gaps

| Planner fact | Current handling | Consequence |
|--------------|------------------|-------------|
| Filing status | ~~Defaults to MFJ~~ | **Fixed T4.1** |
| Social Security | ~~Gross only, line 6b = $0~~ | **Fixed T4.2** |
| Taxable-account gain | ~~Static / replayed basis~~ | **Fixed T4.3** — `row.taxableGainFraction` |
| Empty taxable account | ~~No gain fraction~~ | **Fixed T4.3** |
| Zero-income years | ~~Empty income rejected~~ | **Fixed T4.4** |
| Failed filler rows | ~~Sent through tax runner~~ | **Fixed T4.4** |
| Other income taxablePct | ~~Gross on row; pct discarded~~ | **Fixed T4.5** — `row.otherIncomeTaxable` |
| Traditional withdrawals/RMDs | Assumed 100% taxable | Nondeductible basis lost |
| Pension | Assumed 100% taxable | May overstate if plan adds a taxable share later |
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
- `engine.js` — row facts (`taxableGainFraction`, `otherIncomeTaxable`, `taxBySource`)

---

## T4 work items (prioritized)

1. ~~**Filing status**~~ — done (T4.1)
2. ~~**Social Security**~~ — done (T4.2)
3. ~~**Gain fraction**~~ — done (T4.3)
4. ~~**Zero-income / failed years**~~ — done (T4.4)
5. ~~**taxablePct on other income streams**~~ — done (T4.5)
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
- [x] Other-income `taxablePct` reaches Form 1040 line 8 from an engine row fact
- [x] `npm test` — 187 pass
- [x] `node scripts/verify.mjs` — passes (UI smoke)
- [x] No tax rule math added to `ui/*` or `engine.js` (adapter/glue only)

## Benchmark reminder

annual-08 authoritative fixture remains the tax-module truth test. T4 validates **planner → tax** wiring on realistic engine rows, not just standalone fixtures.

## GPT session opener (T4.6)

```
PARALLAX TAX T4 — read docs/tax/GPT-TAX-WORKFLOW.md and docs/tax/T4-HANDOFF.md
Worktree: C:\Dev\Parallax\.worktrees\Parallax-tax-t4
Branch: feat/tax-t4-planner-adapter (NOT feat/household-wizard)
Base: main @ d9360c5 (+ T4.5 PR when merged)
Tests: npm test (187 baseline) + verify.mjs
Scope: T4.6 — integration tests (MFJ/single/SS/RMD/survivor) or next gap from Remaining T4 gaps table
```
