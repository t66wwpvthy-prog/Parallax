/* Planning-owned federal-funding MC sidecar; shortcut aggregates remain authoritative. */

import { runSimulation } from '../../../engine.js';
import { TaxInputError } from '../../tax/core/errors.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';

/**
 * Re-run the exact shortcut Monte Carlo return paths with federal Form 1040
 * line 24 driving positive tax-delta funding. Only federalSuccessRate is
 * attached to the returned shortcut analysis; its aggregates are not replaced.
 */
export function runMonteCarloWithFederalFunding(
  shortcutAnalysis,
  plan,
  overrides = {},
  options = {}
){
  if(
    shortcutAnalysis === null
    || typeof shortcutAnalysis !== 'object'
    || Array.isArray(shortcutAnalysis)
  ){
    throw new TaxInputError('shortcutAnalysis must be a plain object');
  }
  if(
    shortcutAnalysis.params === null
    || typeof shortcutAnalysis.params !== 'object'
    || Array.isArray(shortcutAnalysis.params)
  ){
    throw new TaxInputError('shortcutAnalysis.params is required');
  }
  if(!Array.isArray(shortcutAnalysis.sims) || shortcutAnalysis.sims.length === 0){
    throw new TaxInputError('shortcutAnalysis.sims is required');
  }

  const returnPaths = shortcutAnalysis.sims.map((sim, index) => {
    if(!Array.isArray(sim?.returnPath)){
      throw new TaxInputError(`shortcutAnalysis.sims[${index}].returnPath is required`);
    }
    return sim.returnPath;
  });
  const taxPolicy = createFederalTaxResolver(shortcutAnalysis.params, options);
  const federalAnalysis = runSimulation(plan, overrides, returnPaths, {
    taxPolicy,
    fundTaxPolicyDelta: true,
  });

  return {
    ...shortcutAnalysis,
    federalSuccessRate: federalAnalysis.successRate,
  };
}
