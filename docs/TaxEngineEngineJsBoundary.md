# Tax Engine ↔ engine.js Boundary

> **Purpose.** This is the scope-control document. It exists to stop the tax engine
> from becoming a second `engine.js`. `TaxEngineArchitecture.md` says what to build;
> this file says what must NOT be mixed, duplicated, or accidentally absorbed.

---

### Responsibility Separation (Non-negotiable)

**engine.js owns:**
- Historical path modeling, seed/path analysis, spending projections, withdrawal sequencing, account depletion, success/failure analysis, resilience testing, portfolio outcomes
- **Answers:** "Does the plan work?"

**Tax engine owns:**
- Tax law, deductions, tax calculations, tax thresholds, tax consequences, audit trails
- **Answers:** "What are the tax implications?"

**Planning layer owns:**
- Comparison of alternatives, strategy evaluation, tax-aware planning analysis
- **Answers:** "What choices should be evaluated?"

---

### Advisor Doctrine

The tax engine should not tell the advisor what to do. It exposes:
- Tax consequences
- Thresholds
- Deltas
- Audit trails

The advisor tells. Parallax shows. engine.js shows plan resilience. Tax engine shows tax mechanics.

---

### Workflow

1. Advisor asks: "Should we convert $50,000 to Roth?"
2. Planning layer creates alternatives
3. Tax engine calculates consequences for each:
   - Tax liability
   - Marginal bracket impact
   - IRMAA effects
   - NIIT effects
   - Threshold crossings
   - Audit trails
4. **No recommendations. No advisor language. No optimization language.**
5. Advisor interprets
6. After a decision is selected: engine.js evaluates the plan with that decision incorporated
7. engine.js returns: success rate, resilience, balances, cash flows, depletion outcomes

---

### Architectural Guardrails (Prevent Scope Creep)

**Do not place strategy modules inside tax core.**
- Avoid: `tax/strategies/`
- Prefer: `planning/taxStrategies/`

**Do not place projection engines inside tax.**
- Avoid: `tax/orchestrators/multiYearTaxProjection.js`
- Prefer: `planning/projections/`

**rulesLedger.js must not become a god object.**
It is a registry only. No calculations, projections, optimization, or dependency resolution.

**Avoid context creep.**
- Good: `{ calculatedAt, runId, scenarioId, taxYear, lawVersion }`
- Bad: `{ household, accounts, portfolioPaths, advisorPreferences, uiState }`

**Avoid audit bloat.**
Audit explains the result. It does not store full household objects, scenario objects, or account structures.

**Maintain separations:**
- Roth conversion inclusion (tax rule) ≠ Roth conversion optimization (planning strategy)
- Medical deduction rules ≠ CCRC planning strategies
- Federal tax logic ≠ State tax logic (state rules stay jurisdiction-specific)

---

### Function Naming (Be Specific)

**Avoid:**
```
calculateTax()
runTaxProjection()
optimizeTaxes()
compareStrategies()
calculateRetirementTax()
```

**Prefer:**
```
calculateOrdinaryIncomeTax()
calculateCapitalGainsStacking()
calculateMedicalExpenseDeduction()
composeAnnualFederalTax()
compareRothConversionAmounts()
```

---

### Red Flags (Boundaries Violated)

- A tax rule imports engine.js
- A tax rule receives the full household object
- A tax rule loops through 30 years
- A tax rule runs projections
- A tax rule recommends a strategy
- A strategy recalculates tax law manually
- A composer mutates input data
- A rule uses `new Date()` internally
- A rule silently defaults missing tax inputs
- A rule returns only a number
- A rule omits audit
- A rule audit contains full household objects
- A ledger contains calculation logic
- Federal rules contain state-specific logic
- State rules contain federal assumptions

---

### Clean Interface

```
engine.js
  ↓
annual cash-flow facts
  ↓
adapter
  ↓
tax engine
  ↓
tax result + audit
  ↓
planning layer
  ↓
advisor interpretation
```

- The tax engine does not import `engine.js`.
- The tax engine does not run projections.
- The tax engine does not receive full household objects inside narrow rules.
- The tax engine returns tax mechanics, thresholds, deltas, and audit trails.
- engine.js remains the owner of projection, resilience testing, and outcome modeling.

**Final doctrine:** engine.js projects. Tax engine calculates. Planning layer compares. The advisor interprets. Parallax shows.
