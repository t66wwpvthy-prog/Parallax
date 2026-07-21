# T9 — Itemized deduction rules (Medical floor + SALT cap)

**Branch:** `feat/tax-t9-itemized-deductions` (new, off `main`)  
**Worktree:** `C:\Dev\Parallax\.worktrees\Parallax-tax-t4`  
**Validation:** `npm test` + `node scripts/verify.mjs` if wizard summary UI changes

## Goal

Unblock wizard Step IV (and live `buildCurrentIncomeTaxSummary`) for **Medical** and **SALT** deductions using locked product parameters:

| Rule | Parameter |
|------|-----------|
| Medical AGI floor | **7.5%** of AGI (IRC §213) |
| SALT cap | **$40,000** for MFJ (2026 demo household) |

Until implemented, `buildCurrentIncomeTaxSummary` returns `status: 'needs_facts'` when medical or SALT rows have `amount > 0`.

## Scope

### In scope

1. **Federal rules** (one file each + test + `rulesLedger.js`):
   - `medicalExpenseDeduction.js` — `deductible = max(0, expenses − 0.075 × agi)`
   - `saltDeductionCap.js` — `deductible = min(enteredSaltTotal, cap)` where `enteredSaltTotal` sums `salt`, `real_estate_tax`, `personal_property_tax`

2. **Itemized composer** — wire rules before `line12e` / Schedule A total:
   - Input: per-type deduction amounts from plan (`incomeTax.deductions[]`)
   - Output: `itemizedAmount` fed to existing standard-vs-itemized compare in `buildCurrentIncomeTaxSummary`

3. **Remove fail-closed gate** in `src/planning/tax/buildCurrentIncomeTaxSummary.js` (`unsupportedCurrentInputs`) for medical/SALT when rules pass tests.

4. **UI display helpers** (wizard / canvas filled state):
   - Medical row: show entered vs applied when applied < entered
   - SALT row: show entered vs capped when entered > cap

### Out of scope

- State tax
- Charitable limitation (60% AGI)
- Mortgage interest limitation
- Investment interest (Form 4952)
- Forwarding itemized deductions into engine Monte Carlo paths (separate T4 follow-up)
- Filing-status SALT caps other than MFJ unless constants table already exists — add MFJ $40k first; other statuses as constants rows when known

## Plan data shape (existing)

```javascript
plan.incomeTax.deductions[]  // { typeId, amount }
// typeId: medical | salt | real_estate_tax | personal_property_tax | charitable | mortgage_interest | other
```

**SALT rollup:** sum amounts where `typeId ∈ { salt, real_estate_tax, personal_property_tax }`, apply single cap, allocate display as one “State & local taxes” row in filled UI.

## Acceptance tests

### Medical

| AGI | Entered | Applied |
|-----|---------|---------|
| $371,250 | $8,000 | $0 (floor = $27,844) |
| $371,250 | $30,000 | $2,156 |
| $100,000 | $10,000 | $2,500 |

### SALT (MFJ)

| Entered (rollup) | Applied |
|------------------|---------|
| $44,800 | $40,000 |
| $30,000 | $30,000 |

### Filled demo reconciliation (CANVAS-HANDOFF §6)

With income $413,000, adjustments $41,750, AGI $371,250:

- Medical $8,000 → **$0 applied**
- Charitable $12,000 → $12,000
- Mortgage $18,400 → $18,400
- SALT $44,800 → **$40,000**
- **Itemized total: $70,400** (beats standard $32,600)

## Files to touch

| File | Change |
|------|--------|
| `src/tax/federal/rules/medicalExpenseDeduction.js` | New rule |
| `src/tax/federal/rules/saltDeductionCap.js` | New rule |
| `src/tax/federal/rulesLedger.js` | Register rules |
| `src/planning/tax/buildItemizedDeductionTotal.js` | New adapter (or extend existing intake path) |
| `src/planning/tax/buildCurrentIncomeTaxSummary.js` | Use computed itemized; drop medical/SALT block |
| `src/planning/tax/buildCurrentIncomeTaxSummary.test.js` | Flip blocked tests → ready + amounts |
| `docs/mocks/CANVAS-HANDOFF.md` | Already updated with rule lock |

## GPT session opener (paste)

```
PARALLAX T9 — Itemized deduction rules (Medical 7.5% AGI floor + SALT $40k MFJ cap)

READ FIRST:
- docs/tax/T9-ITEMIZED-DEDUCTIONS-HANDOFF.md
- docs/tax/GPT-TAX-WORKFLOW.md
- docs/ARCHITECTURE.md (one rule = one file in src/tax/federal/rules/)

Worktree: C:\Dev\Parallax\.worktrees\Parallax-tax-t4
Branch: feat/tax-t9-itemized-deductions (new off main)

Rules:
- Medical: deductible = max(0, entered − 0.075 × AGI)
- SALT: rollup salt + real_estate_tax + personal_property_tax; cap $40,000 MFJ

Wire into buildCurrentIncomeTaxSummary so wizard/canvas Step IV Medical and SALT rows compute instead of needs_facts.

Tests: npm test (all existing + new rule tests). Do not touch ui/householdWizard unless summary wiring requires it.
```
