/* ============================================================================
   TAX ENGINE — schemas
   Plain-data shape descriptors for rule inputs and the execution context. These
   are intentionally lightweight (no external schema library): each describes the
   required fields and their types so validators.js can enforce them and so the
   shapes are documented in one place.

   Shapes only — no calculation logic.
   ============================================================================ */

// The execution context every calculate(input, context) call receives. Supplied
// by the CALLER (never generated inside a rule) so tests and replays are
// deterministic. See docs/TaxEngineArchitecture.md → Calculation Contract.
export const CONTEXT_SCHEMA = {
  fields: {
    calculatedAt: 'string',   // ISO 8601, e.g. '2026-06-14T12:00:00.000Z'
    runId:        'string',
    scenarioId:   'string',
    taxYear:      'number',
    lawVersion:   'string',
  },
  required: ['calculatedAt', 'runId', 'scenarioId', 'taxYear', 'lawVersion'],
};

// Phase-1 ordinary-income rule input. Brutally narrow on purpose: the caller
// hands the rule taxableOrdinaryIncome already resolved (no AGI/MAGI/deduction
// math lives here).
export const ORDINARY_INCOME_INPUT_SCHEMA = {
  fields: {
    filingStatus:         'string',
    taxableOrdinaryIncome: 'number',
  },
  required: ['filingStatus', 'taxableOrdinaryIncome'],
};
