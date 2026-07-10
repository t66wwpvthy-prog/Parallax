# T2 income spine handoff

**Branch:** `feat/tax-t2-income-spine`  
**Base:** `main` @ `7f2d057` (T1 merged, PR #80)  
**Validation:** `npm test` only (no `verify.mjs` — no UI)

## Goal

Reconcile **Form 1040 lines 1–16** from complete inputs on the authoritative benchmark, without inventing missing income categories.

T1 locked line 15 and the worksheet split as fixture facts. T2 makes preferential-income and Schedule D handling **calculated**, not only supplied.

## Authoritative benchmark (do not break)

Fixture: `src/tax/tests/fixtures/annual/annual-08-authoritative-2025-mfj.json`

| Input / result | Value |
|----------------|------:|
| Line 15 (taxable income) | $80,328 |
| Qualified dividends (3a) | $3,358 |
| Schedule D line 16 | -$7,656 |
| Worksheet Schedule D gain used | $0 (loss → no preferential gain from Sch D) |
| Ordinary-taxable portion | $76,970 |
| Parallax line 16 | $8,759.40 |
| Filed line 16 (Tax Table) | $8,760 |
| Line 24 | $10,330.40 (filed $10,331, -$0.60) |

Full attribution: `docs/tax/T1-BENCHMARK-RECONCILIATION.md`

## T2 work items

### 1. Schedule D ST/LT classification (priority)

Fixture already captures Schedule D lines 7, 15, 16, 18, 19. Today:

- `scheduleD` is recorded as `architectureLater` in intake report
- Preferential stacking uses supplied `capitalGains.qualifiedDividends` and `netLongTermCapitalGains` only

**Deliver:** derive preferential components from Schedule D detail where present; respect loss → $0 worksheet gain rule.

Key files:

- `src/tax/federal/composers/form1040Spine.js`
- `src/tax/federal/rules/capitalGainsStacking.js`
- `src/tax/adapters/intakeReport.js`
- `src/tax/core/1040BasicLineMap.js`

### 2. Line 16 Tax Table gap (optional)

The **$0.60** delta vs filed line 16 is IRS Tax Table rounding vs exact bracket math on $76,970 ordinary-taxable income.

**Deliver (optional):** Tax Table lookup for worksheet line 22 when benchmark requires it; or document as accepted tolerance and skip.

### 3. Tests

- Keep `annual-08` passing within $1 line 24 tolerance
- Add rule/composer tests for Schedule D → preferential path
- Do not change `demo-wages` synthetic expectations unless intake shape changes

## Explicitly deferred

| Item | Phase |
|------|-------|
| $1,028 self-employment tax calculation | T3 |
| $543 NIIT calculation | T3 |
| Additional Medicare, AMT, credits | T3 |
| Filing status / SS / basis from planner rows | T4 |
| Cash Flow tax column / sidecar UI | T5 |

## Success criteria

- [ ] Schedule D facts drive preferential income when supplied (annual-08 still passes)
- [ ] `npm test` — 158+ passed, 0 failed
- [ ] No changes to `engine.js`, `src/planning/tax/*`, or `ui/*`
- [ ] One rule per file + `rulesLedger.js` entry if new rules added
