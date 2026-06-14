# Tax Engine Architecture

This is the positive build spec for the Parallax tax engine: what to build.
For what the tax engine must NOT become, see `TaxEngineEngineJsBoundary.md`.

## Foundation Architecture & Doctrine

### Core Doctrine

**Rules calculate law.**
**Composers combine rules.**
**Strategies compare choices.**
**The advisor interprets.**
**Parallax shows.**

The tax engine does not recommend actions. It exposes tax consequences, thresholds, deltas, and audit trails.

---

## Technical Design

### Phase 1 Build Scope

**Federal Ordinary Income Tax — first, before IRA deductibility.**

Why this is the foundational primitive:
- Easiest to validate against published tables
- Reused by Roth conversions, IRMAA, Social Security taxation, LTCG stacking, RMDs, charitable planning, CCRC planning, and threshold analysis

Phase 1 rule scope — **brutally narrow**:
- Input: `{ filingStatus, taxableOrdinaryIncome }` — nothing more
- Output: `{ ordinaryTax, marginalRate, effectiveRate, bracketBreakdown }` + full audit
- It calculates **bracket tax only**. It does NOT calculate gross income, AGI, MAGI, standard deduction, itemized deductions, Social Security taxation, Roth strategy, IRMAA, or anything household-level. The caller hands it `taxableOrdinaryIncome` already resolved.
- Tests: all filing statuses (single, MFJ, HoH, MFS), bracket-edge cases ($1 below/at/above a threshold), `$0` income, high income, marginal rate, effective rate, `JSON.stringify(audit)` survives, bad inputs throw
- Authority: IRC §1, IRS 2026 tax rate schedules
- Validation: 2026 tax tables + Nathan's household / manual tax prep

Subsequent phases (see Growth Path) each reuse the bracket primitive.

---

### Rule Contract

Every rule exports a complete object:

```js
export const ordinaryIncomeTax = {
  meta,       // full metadata (see Metadata Contract)
  validate,   // rule-level validation (throws on bad input)
  calculate,  // calculate(input, context) -> { result, audit }
};
```

---

### Rules Ledger

`rulesLedger.js` is the master registry — **registry only**, no calculation logic.

```js
import { ordinaryIncomeTax } from '../federal/rules/ordinaryIncomeTax.js';
// ...

export const rulesLedger = [
  ordinaryIncomeTax,
  // ...
];
```

Used for:
- Execution (which rules to run)
- Documentation (what rules are implemented)
- Testing (which rules to test)
- Querying (e.g. which rules carry `triggerTag: 'age_73'`?)

---

### Metadata Contract

```js
export const meta = {
  ruleId: 'FED_ORDINARY_INCOME_TAX',
  ruleVersion: '1.0.0',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
  jurisdiction: 'federal',
  category: 'ordinary_income_tax',
  authority: ['IRC §1(c)', 'IRS 2026 Tax Rate Schedules'],
  dataSourcesRequired: ['IRS_2026_TAX_TABLES_v1.0'],
  inputsRequired: ['filingStatus', 'taxableOrdinaryIncome'],
  outputs: ['ordinaryTax', 'marginalRate', 'effectiveRate', 'bracketBreakdown'],
  limitations: ['Does not calculate AMT', 'Does not calculate credits', 'Does not calculate NIIT'],
  triggerTags: ['agi_threshold', 'bracket_calculation', 'roth_conversion', 'charitable_planning'],
};
```

Key distinctions:
- `ruleVersion` = code version (semantic versioning: patch = no math change, minor = expanded same-result logic, major = material calculation change)
- `taxYear` = legal year being calculated
- `lawVersion` = legal regime/scenario (`2026_FINAL`, `2027_PROJECTED`, `2026_PATCHED_REV_PROC_XXXX`, `TCJA_SUNSET_MODELED`, `CUSTOM_SCENARIO`)
- `dataSourcesRequired` = versioned tax-data dependencies (tables, std deductions, IRMAA brackets, SS thresholds, state brackets, contribution limits)

`triggerTags` let Parallax query the ledger: "which rules are affected by AGI?", "which trigger at age 73?", "which are impacted by Roth conversions?", "which thresholds are near breach?"

---

### Validation (Two Layers, Throw — No Silent Defaults)

```js
validateTaxInput(householdTaxInput)  // Layer 1: central schema — catches malformed structure
ordinaryIncomeTax.validate(input)    // Layer 2: rule-level — catches missing rule-specific fields
```

- Central validator catches malformed household data
- Rule validator keeps the rule safe even when called outside the main engine
- Tax validation **throws**. A missing tax input is an error, not a fallback. No silent defaults unless legally required.

---

### Calculation Contract

```js
calculate(input, context) -> { result, audit }
```

**Input** — only the fields the rule requires:
```js
{ filingStatus: 'single', taxableOrdinaryIncome: 120000 }
```

**Context** — supplied externally by the caller (never generated inside the rule), which guarantees deterministic tests and reproducibility:
```js
{
  calculatedAt: '2026-06-14T12:00:00.000Z',
  runId: 'scenario_plan_2026_base',
  scenarioId: 'base_case',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
}
```

---

### Audit Trail

Every rule returns `{ result, audit }` — **never a bare number**.

```js
{
  result: {
    ordinaryTax: 18442,
    marginalRate: 0.24,
    effectiveRate: 0.15,
    bracketBreakdown: [
      { rate: 0.10, income: 11600, tax: 1160 },
      { rate: 0.12, income: 35550, tax: 4266 },
      // ... all brackets
    ],
  },
  audit: {
    ruleId: 'FED_ORDINARY_INCOME_TAX',
    ruleVersion: '1.0.0',
    taxYear: 2026,
    lawVersion: '2026_FINAL',
    calculatedAt: '2026-06-14T12:00:00.000Z',
    runId: 'scenario_plan_2026_base',
    scenarioId: 'base_case',
    inputsUsed: { filingStatus: 'single', taxableOrdinaryIncome: 120000 },
    dataSourcesUsed: ['IRS_2026_TAX_TABLES_v1.0'],
    calculationSteps: [
      { bracket: 1, rate: 0.10, income: 11600, tax: 1160 },
      { bracket: 2, rate: 0.12, income: 35550, tax: 4266 },
      // ... detailed steps
    ],
    authority: ['IRC §1(c)', 'IRS 2026 Tax Rate Schedules'],
    limitations: ['Does not calculate AMT', 'Does not calculate credits'],
  },
}
```

Audit requirements:
- Must pass `JSON.stringify(audit)` cleanly. If it can't serialize, it does not belong in the audit.
- No functions, class instances, Dates (ISO strings only), circular references, or imported objects
- No full household / scenario / account objects

**Reproducibility guarantee:**
> Same inputs + same `ruleVersion` + same `lawVersion` + same `dataSourcesUsed` = same output.

---

### Rule Design Principles

**Rules are narrow.** `ordinaryIncomeTax` calculates ONLY:
- ordinary tax, marginal rate, effective rate, bracket breakdown

It does NOT calculate:
- AGI, MAGI, itemized deductions, Social Security taxation, NIIT, IRMAA, state tax

**Rules receive only required fields:**
```js
ordinaryIncomeTax({ filingStatus, taxableOrdinaryIncome })   // good
ordinaryIncomeTax(fullHouseholdObject)                       // bad
```

Narrow input scope makes rules testable, reusable, and composable.

---

### Composers

Use composers to combine interacting rules. Composers understand interactions; rules stay narrow.

Example — `annualFederalTax.js` combines:
- ordinaryIncomeTax
- capitalGainsStacking
- qualifiedDividendStacking

A composer never mutates input data and never recalculates law a rule already owns.

---

### Growth Path

**Phase 1 — core foundation:**
- Federal Ordinary Income Tax (foundational primitive)

**Phase 2 — build on Phase 1:**
- Traditional IRA Deductibility
- Long-Term Capital Gains Stacking
- Social Security Taxation (85% rule)

**Phase 3:**
- IRMAA
- NIIT (Net Investment Income Tax)
- Qualified Charitable Distributions
- Charitable Deductions
- Medical Expense Deductions
- Roth Conversion Inclusion

**Future planning modules (live in `planning/`, NOT in tax core):**
- Roth Conversion Windows
- Bracket Fill
- QCD vs. Cash Giving
- Donor-Advised Fund Bunching
- CCRC Planning

Goal: the engine never returns only a number. It returns result + audit + thresholds + tax consequences. Every number must be traceable.

---

### Directory Structure

```
src/tax/
  core/
    schemas.js              # central input/output schemas
    validators.js           # central schema validation (Layer 1)
    errors.js               # typed tax errors (thrown, never silently defaulted)
    constants.js            # bracket tables, std-deduction values, etc.
    dataSourceRegistry.js   # versioned tax-data dependencies (e.g. IRS_2026_TAX_TABLES_v1.0)
    rulesLedger.js          # master registry of all rules (registry only)

  federal/
    rules/
      ordinaryIncomeTax.js          # Phase 1: bracket tax only
      ordinaryIncomeTax.test.js
      # (later) iraDeductibility.js, capitalGainsStacking.js,
      #         socialSecurityTaxation.js, niit.js, irmaa.js, qcd.js,
      #         charitableDeduction.js, medicalExpenseDeduction.js
    composers/
      annualFederalTax.js           # starts by calling ordinaryIncomeTax only

  adapters/
    engineToTaxInput.js     # SEAM ONLY: engineYearResult -> taxInput. Not live wiring.

  state/
    # (later) vaIncomeTax.js + colocated test — jurisdiction-specific

  tests/
    integration.test.js
    householdScenarios.test.js
```

- Each rule file holds `meta`, `validate`, `calculate`, plus colocated unit tests (`rule.test.js` next to `rule.js`)
- Integration tests in `tests/` verify rules working together
- Strategies and projections do NOT live here — see `TaxEngineEngineJsBoundary.md`
- The adapter is a shape translation only; building it does NOT connect the tax engine to live `engine.js` behavior (that is a later step)
