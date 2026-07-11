/* Planning-owned story-path rerun: preserve MC aggregates, replace p10/p50/p90. */

import { runSinglePath } from '../../../engine.js';
import { TaxInputError } from '../../tax/core/errors.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';

/**
 * Re-run the selected Monte Carlo p10/p50/p90 return paths with federal line 24
 * as their reported row tax. Only their matching sims entries are replaced;
 * Monte Carlo aggregates retain their original shortcut results.
 */
export function rerunTypicalPathWithFederalTax(analysis, options = {}){
  if(analysis === null || typeof analysis !== 'object' || Array.isArray(analysis)){
    throw new TaxInputError('analysis must be a plain object');
  }
  if(analysis.params === null || typeof analysis.params !== 'object' || Array.isArray(analysis.params)){
    throw new TaxInputError('analysis.params is required');
  }

  if(!Array.isArray(analysis.sims)){
    throw new TaxInputError('analysis.sims is required');
  }

  const taxPolicy = createFederalTaxResolver(analysis.params, options);
  const pathKeys = ['p10', 'p50', 'p90'];
  const federalPaths = {};
  const federalBySimIndex = new Map();

  for(const pathKey of pathKeys){
    const selected = analysis.paths?.[pathKey];
    if(!selected || !Array.isArray(selected.returnPath)){
      throw new TaxInputError(`analysis.paths.${pathKey}.returnPath is required`);
    }
    let federalPath = federalBySimIndex.get(selected.simIndex);
    if(!federalPath){
      federalPath = runSinglePath(analysis.params, selected.returnPath, { taxPolicy });
      federalPath.simIndex = selected.simIndex;
      federalPath.returnPath = selected.returnPath;
      federalBySimIndex.set(selected.simIndex, federalPath);
    }
    federalPaths[pathKey] = federalPath;
  }

  return {
    ...analysis,
    paths: {
      ...analysis.paths,
      ...federalPaths,
    },
    sims: analysis.sims.map((sim) => federalBySimIndex.get(sim.simIndex) ?? sim),
  };
}
