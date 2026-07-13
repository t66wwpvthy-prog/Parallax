/* Planning-owned historical run with converged federal Form 1040 funding. */

import { resolveInputs, runHistoricalPath } from '../../../engine.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';

/**
 * Run one historical sequence whose retirement withdrawals and balances fund
 * the same federal line 24 shown on every row.
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
    { taxPolicy, fundTaxPolicyDelta: true }
  );
}
