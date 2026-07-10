# T2 income spine handoff

**Branch:** `feat/tax-t2-income-spine`  
**Base:** `main` @ `7f2d057` (T1 merged, PR #80)  
**Validation:** `npm test` only (no `verify.mjs` — no UI)

## Status

**Schedule D classification implemented** — `FED_SCHEDULE_D_CLASSIFICATION` rule wired through `form1040Spine.js`.

- annual-08 no longer supplies manual `netLongTermCapitalGains: 0`
- Form 1040 line 7a calculated as `-$3,000` from Schedule D loss limitation
- Preferential Schedule D gain `$0`; qualified dividends `$3,358` via line 3a
- Benchmark still passes: line 24 `$10,330.40` vs filed `$10,331` (-$0.60)
- **167 tests passing**

## Goal

Reconcile **Form 1040 lines 1–16** from complete inputs on the authoritative benchmark, without inventing missing income categories.

## Authoritative benchmark (do not break)

Fixture: `src/tax/tests/fixtures/annual/annual-08-authoritative-2025-mfj.json`

| Input / result | Value |
|----------------|------:|
| Line 15 (taxable income) | $80,328 |
| Line 7a (from Schedule D) | -$3,000 |
| Qualified dividends (3a) | $3,358 |
| Schedule D line 16 | -$7,656 |
| Worksheet Schedule D gain used | $0 |
| Ordinary-taxable portion | $76,970 |
| Parallax line 16 | $8,759.40 |
| Line 24 | $10,330.40 (filed $10,331, -$0.60) |

## Implemented (T2)

### `scheduleDClassification.js`

- Verifies line 16 = line 7 + line 15
- Capital-loss limit: $3,000 ($1,500 MFS)
- Preferential gain: `min(line15, line16)` when both positive; else $0
- Rejects lines 18/19 > 0 (Schedule D Tax Worksheet required)

### Composer wiring

- `form1040Spine.js` — Schedule D → line 7a + preferential components
- `annualFederalTax.js` — passes classification to stacking
- `capitalGainsStacking.js` — unchanged
- `intakeReport.js` — metadata updated when classification applied

## Deferred

| Item | Phase |
|------|-------|
| IRS Tax Table vs exact bracket ($0.60) | optional T2 follow-up |
| Schedule D Tax Worksheet (lines 18/19 > 0) | T2+ or T3 |
| $1,028 SE tax + $543 NIIT calculation | T3 |
| Planner adapter facts | T4 |

## Success criteria

- [x] Schedule D facts drive preferential income when supplied (annual-08 passes)
- [x] `npm test` — 167 passed, 0 failed
- [x] No changes to `engine.js`, `src/planning/tax/*`, or `ui/*`
- [x] One rule file + test + `rulesLedger.js` entry
