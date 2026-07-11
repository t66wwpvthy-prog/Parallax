/* Planning-owned historical run with federal Form 1040 line 24 row taxes. */

import { resolveInputs, runHistoricalPath } from '../../../engine.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';

/**
 * Run one historical sequence with federal-reported row taxes. The engine's
 * funding, withdrawal gross-up, RMD, and balance mechanics remain unchanged.
 */
export function runHistoricalPathWithFederalTax(
  plan,
  startYear,
  strategy,
  transform,
  overrides,
  taxOptions = {}
){
  const params = resolveInputs(plan, overrides || {});
  const taxPolicy = createFederalTaxResolver(params, {
    ...taxOptions,
    filingStatus: taxOptions.filingStatus ?? plan?.meta?.filingStatus,
  });
  return runHistoricalPath(
    plan,
    startYear,
    strategy,
    transform,
    overrides,
    { taxPolicy }
  );
}
