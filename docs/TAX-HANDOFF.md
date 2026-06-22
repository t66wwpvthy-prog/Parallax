# Tax Engine Handoff — Codex

**Last updated:** 2026-06-21  
**Branch:** `feat/tax-1040-spine`  
**Commit:** `8d93578` — *Add Form 1040 spine and Phase 2 federal tax rules.*  
**Push status:** Local only (no upstream configured)  
**Tests:** 115/115 passing (`npm test`)

---

## Current state (verified)

Phase 2 **1040 spine + rule wiring is implemented and committed** on `feat/tax-1040-spine`.

| Piece | Status |
|-------|--------|
| `ordinaryIncomeTax` | ✅ Phase 1 — narrow input unchanged |
| `capitalGainsStacking` | ✅ Committed + unit tests |
| `taxableSocialSecurity` | ✅ Committed + unit tests |
| `traditionalIraDeductibility` | ✅ Committed + unit tests |
| `form1040Lines.js` | ✅ Line model + status enum |
| `form1040Spine.js` | ✅ Income/deduction lines 1z→15 |
| `composeAnnualFederalTax` | ✅ Returns `{ form1040, totalFederalTax, audits }` |
| Form 1040 line objects | ✅ All spine lines present with status |
| `adaptEngineYearToTaxInput` | ✅ Seam only — still `{ filingStatus, taxableOrdinaryIncome }` |
| Engine/UI wiring | ❌ Not started (by design) |

### Composer output

```js
{
  result: {
    form1040: { line1z, line9, … line24 },  // each: { lineId, label, value, status, ruleId?, auditIndex? }
    totalFederalTax,                        // === line24.value
  },
  audits: [ /* rule audit trails */ ],
}
```

### Phase 2 rule wiring (through spine, not sidecars)

| Rule | Spine role |
|------|------------|
| `FED_TAXABLE_SOCIAL_SECURITY` | → line6b → line9 → line11a → line15 |
| `FED_TRADITIONAL_IRA_DEDUCTIBILITY` | → line10 → line11a → line15 |
| `FED_CAPITAL_GAINS_STACKING` | → line16 (after ordinary tax on ordinary portion) |
| `FED_ORDINARY_INCOME_TAX` | → line16; input still `{ filingStatus, taxableOrdinaryIncome }` only |

### Input modes

**A. Phase 1 shortcut**
```js
{ filingStatus: 'single', taxableOrdinaryIncome: 100_000 }
```
→ line15 SUPPLIED; upstream DEFERRED; line24 = ordinary bracket tax.

**B. Shortcut + capital gains**
```js
{ filingStatus: 'single', taxableOrdinaryIncome: 49_000,
  capitalGains: { netLongTermCapitalGains: 1_000, qualifiedDividends: 0 } }
```
→ line15 = $50,000; line24 = $5,714.50.

**C. Full spine**
```js
{ filingStatus: 'marriedFilingJointly', supplied: { line1z: 38_000, line12e: 31_500 },
  socialSecurity: { … }, traditionalIra: { … } }
```
→ line15 = $5,645; line24 = $564.50.

### Smoke scenarios (manual flow check)

```powershell
npm run tax:smoke              # all three scenarios
npm run tax:smoke -- phase1
npm run tax:smoke -- capitalGains
npm run tax:smoke -- fullSpine
```

Expected totals: phase1 **$16,712** · capitalGains **$5,714.50** · fullSpine **$564.50**.

---

## Doctrine (non-negotiable)

- `docs/TaxEngineArchitecture.md` — rules vs composers, audit contract
- `docs/TaxEngineEngineJsBoundary.md` — no `engine.js` imports in `src/tax/`

**Rules calculate law. Composers combine rules. Composers never recalculate law a rule owns.**

`ordinaryIncomeTax` input stays brutally narrow forever:

```js
{ filingStatus, taxableOrdinaryIncome }
```

---

## What is NOT done (Phase 3 — next work)

- Standard deduction **rule** (line12e must be supplied manually today)
- Credits / Schedule 2–3 amounts (lines 17, 19, 20, 23 → `NOT_APPLICABLE`)
- SS ↔ IRA circular worksheet iteration
- Extend `adaptEngineYearToTaxInput` to emit `supplied` lines from engine year facts
- Wire `composeAnnualFederalTax` into planning layer / UI

**Do not wire into `engine.js` or UI until adapter + at least one real scenario is validated.**

---

## Scope boundaries — DO NOT TOUCH in tax PRs

Local sandbox changes (uncommitted, intentionally excluded from `8d93578`):

| File / area | Why |
|-------------|-----|
| Deleted `index.html` | Monolith retired locally; do not push deletion to `main` until UI port approved |
| `.gitignore` UI/mock entries | Local mock-first workflow |
| `scripts/mock-preview.mjs`, `docs/LOCAL-DEV.md` | Dev tooling |
| `Parallax Code Audits/`, `archive/` | Local audit output |
| `engine-worker.js` | Separate engine work |

Use `git diff main..HEAD --stat` for committed branch scope. Working-tree `git diff main --stat` will look dirty because of the above local files.

---

## Key files

```
src/tax/core/form1040Lines.js                   ← line model + statuses
src/tax/federal/composers/form1040Spine.js      ← income spine 1z→15
src/tax/federal/composers/annualFederalTax.js   ← tax spine 16→24
src/tax/federal/rules/ordinaryIncomeTax.js      ← do not widen input
src/tax/federal/rules/capitalGainsStacking.js
src/tax/federal/rules/taxableSocialSecurity.js
src/tax/federal/rules/traditionalIraDeductibility.js
src/tax/tests/integration.test.js
src/tax/federal/composers/form1040Spine.test.js
scripts/tax-smoke.mjs                           ← manual flow check
src/tax/adapters/engineToTaxInput.js            ← extend in Phase 3
```

---

## Codex verification checklist

```powershell
git checkout feat/tax-1040-spine
npm test                         # 115 pass
npm run tax:smoke                # three scenarios above
git diff main..HEAD --stat       # tax-only committed diff
```

Confirm:
1. `composeAnnualFederalTax` returns `result.form1040` + `totalFederalTax === line24.value`
2. All spine line IDs present with valid status
3. `ORDINARY_INCOME_INPUT_SCHEMA` still two fields only
4. No `src/tax/**` import of `engine.js`
5. Integration test: SS + IRA change line15 and total tax via spine

---

## Git / PR notes

- Branch: `feat/tax-1040-spine` at `8d93578`, **not pushed**
- Open PR against `main` when Nathan approves push
- Next tax work: Phase 3 on same branch or a follow-up branch
