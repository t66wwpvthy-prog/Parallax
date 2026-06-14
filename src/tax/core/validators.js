/* ============================================================================
   TAX ENGINE — validation (Layer 1: central schema)
   Generic, shape-driven checks shared by every rule. These catch malformed
   structure (missing fields, wrong types, NaN, non-finite numbers) BEFORE a
   rule's own Layer-2 validation checks rule-specific semantics.

   Everything here THROWS TaxInputError. No silent defaults.
   ============================================================================ */

import { TaxInputError } from './errors.js';

// Validate a plain object against a schema ({ fields, required }). Checks that
// each required field is present and that every present field matches its
// declared primitive type. Numbers must additionally be finite (rejects NaN /
// Infinity sneaking in as an input). Throws TaxInputError on the first problem.
export function validateAgainstSchema(value, schema, label = 'input'){
  if(value === null || typeof value !== 'object' || Array.isArray(value)){
    throw new TaxInputError(`${label} must be a plain object`, { received: typeof value });
  }
  for(const field of schema.required){
    if(!(field in value) || value[field] === undefined || value[field] === null){
      throw new TaxInputError(`${label} is missing required field: ${field}`, { field });
    }
  }
  for(const [field, expectedType] of Object.entries(schema.fields)){
    if(!(field in value) || value[field] === undefined || value[field] === null) continue;
    const actual = typeof value[field];
    if(actual !== expectedType){
      throw new TaxInputError(
        `${label} field ${field} must be a ${expectedType}, got ${actual}`,
        { field, expectedType, actualType: actual }
      );
    }
    if(expectedType === 'number' && !Number.isFinite(value[field])){
      throw new TaxInputError(`${label} field ${field} must be a finite number`, { field, value: String(value[field]) });
    }
  }
  return value;
}

// Convenience guard for a non-negative finite number (e.g. taxable income).
export function assertNonNegativeNumber(value, field, label = 'input'){
  if(typeof value !== 'number' || !Number.isFinite(value)){
    throw new TaxInputError(`${label} field ${field} must be a finite number`, { field });
  }
  if(value < 0){
    throw new TaxInputError(`${label} field ${field} must be >= 0`, { field, value });
  }
  return value;
}

// Convenience guard for an enum (e.g. filingStatus, lawVersion).
export function assertOneOf(value, allowed, field, label = 'input'){
  if(!allowed.includes(value)){
    throw new TaxInputError(
      `${label} field ${field} must be one of: ${allowed.join(', ')}`,
      { field, value: String(value), allowed }
    );
  }
  return value;
}
