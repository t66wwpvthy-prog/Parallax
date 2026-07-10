# T1 benchmark handoff

**Branch:** `feat/tax-t1-benchmark` (base: `main` after #78 UI modularization, #79 architecture docs)

**Baseline:** `npm test` — 156 passed, 0 failed. No tax rule or adapter changes yet.

## Goal (T1 only)

Lock an authoritative benchmark fixture that reconciles Parallax `line24` to a client return within agreed tolerance. Fixtures + tests + reconciliation notes only — no new rules (T3), no adapter/UI work (T4/T5).

## Current benchmark gap

Fixture: `src/tax/tests/fixtures/engine-year/demo-wages.json`

| Fact | Value |
|------|-------|
| Filing | MFJ 2025 |
| Wages | $348,867 |
| Ordinary dividends | $111 |
| Capital gain | $983 |
| Itemized | $58,763 |
| Parallax line16/24 | $55,493.05 |
| Client target line24 | $56,815.00 |
| Gap | $1,321.95 |

Fixture lacks: line 3a (qualified dividends), W-2 box 5 Medicare wages, Schedule 2, Schedule D ST/LT detail, lines 17/19/20/23.

Likely gap drivers (unproven): Additional Medicare Tax (~$890), NIIT (~$42), ST/LT classification (~$88), ~$400 unidentified.

## Architecture reminders

- `engine.js` `row.taxes` = simulation truth
- Federal sidecar = parallel diagnostic on typical path only (`src/planning/tax/attachTypicalPathFederalTax.js`)
- Cash Flow single `Tax` column (`ui/cashflow.js`); `verify.mjs` rejects Engine/Federal side-by-side columns
- Deferred lines 17/19/20/23 → `INCOME_TAX_ONLY` scope (`src/tax/core/form1040Lines.js`)

## Phase sequence

| Phase | Scope | Validation |
|-------|-------|------------|
| T1 | Benchmark fixture lock | `npm test` |
| T2 | Lines 1–16 reconcile | `npm test` |
| T3 | Lines 17–23, `FULL_1040` | `npm test` |
| T4 | Planner adapter facts | `npm test` + `verify.mjs` |
| T5 | Sidecar validation + UI scope | `npm test` + `verify.mjs` |
| T6 | Decision: engine vs federal truth | evidence gate |

## Key files

- `src/tax/tests/fixtures/engine-year/demo-wages.json`
- `src/tax/tests/demoWagesRegression.test.js`
- `src/tax/core/1040BasicLineMap.js`
- `src/tax/federal/composers/form1040Spine.js`
- `docs/tax/1040-basic-line-map.md`

## Resume checklist

1. `git checkout feat/tax-t1-benchmark`
2. `npm test`
3. Obtain client return evidence (W-2 box 5, Schedule 2, Schedule D, lines 16/17/19/20/23)
4. Expand fixture + regression assertions per 1040 line
5. Document dollar attribution for the $1,321.95 gap
