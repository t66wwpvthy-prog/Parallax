/* ============================================================================
   ADAPTER (SEAM ONLY): engine year result → tax input
   This is the translation seam named in docs/TaxEngineEngineJsBoundary.md →
   Clean Interface. Building it does NOT wire the tax engine into live engine.js
   behavior — that is a later step. It only defines the SHAPE translation so the
   two sides can be connected cleanly when the time comes.

   Hard boundaries (enforced by the doctrine):
   - Does NOT import engine.js. engine.js does not know tax rules; tax rules do
     not know engine.js exists. This adapter is the only place that knows both
     shapes, and it knows them as plain data.
   - Does NOT compute tax law. Resolving taxableOrdinaryIncome from raw cash
     flows (e.g. the taxable share of Social Security) is RULE/COMPOSER work,
     not the adapter's. The adapter only reshapes already-resolved facts.
   - No silent defaults: a missing required field throws, like the rest of the
     engine.
   ============================================================================ */

import { TaxInputError } from '../core/errors.js';

// Map an engine-produced, already-resolved year fact bundle to the narrow
// Phase-1 ordinary-income tax input. The bundle is expected to carry a
// `filingStatus` and a resolved `taxableOrdinaryIncome` (the upstream planning
// layer / future SS-taxation + deduction rules produce that figure; the adapter
// does not invent it).
export function adaptEngineYearToTaxInput(engineYearResult){
  if(engineYearResult === null || typeof engineYearResult !== 'object' || Array.isArray(engineYearResult)){
    throw new TaxInputError('engineYearResult must be a plain object', { received: typeof engineYearResult });
  }
  const { filingStatus, taxableOrdinaryIncome } = engineYearResult;
  if(filingStatus === undefined || filingStatus === null){
    throw new TaxInputError('engineYearResult is missing filingStatus', { field: 'filingStatus' });
  }
  if(taxableOrdinaryIncome === undefined || taxableOrdinaryIncome === null){
    throw new TaxInputError('engineYearResult is missing taxableOrdinaryIncome', { field: 'taxableOrdinaryIncome' });
  }
  // Reshape only — no computation. The narrow input the rule contract expects.
  return { filingStatus, taxableOrdinaryIncome };
}
