/* ============================================================================
   TAX ENGINE — typed errors
   Tax validation THROWS. A missing or malformed tax input is an error, never a
   silent default. These typed errors let callers distinguish a structural input
   problem (TaxInputError) from a rule-contract violation (TaxRuleError) and an
   unknown/unsupported data dependency (TaxDataError).

   Zero dependency on engine.js. (See docs/TaxEngineEngineJsBoundary.md.)
   ============================================================================ */

// Base class so callers can `catch (e) { if (e instanceof TaxError) … }`.
export class TaxError extends Error {
  constructor(message, details = {}){
    super(message);
    this.name = 'TaxError';
    // `details` is plain data only (kept JSON-serializable on purpose).
    this.details = details;
  }
}

// Layer-1 / Layer-2 validation failures: a required field is missing, the wrong
// type, out of range, or an unrecognized enum value (e.g. a bad filingStatus).
export class TaxInputError extends TaxError {
  constructor(message, details = {}){
    super(message, details);
    this.name = 'TaxInputError';
  }
}

// A rule-contract violation: a rule was handed something it cannot honor, or a
// context field the calculation requires is absent.
export class TaxRuleError extends TaxError {
  constructor(message, details = {}){
    super(message, details);
    this.name = 'TaxRuleError';
  }
}

// A versioned tax-data dependency could not be resolved (unknown lawVersion,
// missing data-source id, etc.). Keeps "the math is wrong" distinct from
// "we don't have the law data for this request."
export class TaxDataError extends TaxError {
  constructor(message, details = {}){
    super(message, details);
    this.name = 'TaxDataError';
  }
}
