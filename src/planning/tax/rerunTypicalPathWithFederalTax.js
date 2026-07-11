/* Planning-owned p50 rerun: preserve MC analysis, replace only the typical path. */

import { runSinglePath } from '../../../engine.js';
import { TaxInputError } from '../../tax/core/errors.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';

/**
 * Re-run the already-selected Monte Carlo p50 return path with federal line 24
 * as its reported row tax. All Monte Carlo simulations and aggregates retain
 * their original shortcut-tax results.
 */
export function rerunTypicalPathWithFederalTax(analysis, options = {}){
  if(analysis === null || typeof analysis !== 'object' || Array.isArray(analysis)){
    throw new TaxInputError('analysis must be a plain object');
  }
  if(analysis.params === null || typeof analysis.params !== 'object' || Array.isArray(analysis.params)){
    throw new TaxInputError('analysis.params is required');
  }

  const typical = analysis.paths?.p50;
  if(!typical || !Array.isArray(typical.returnPath)){
    throw new TaxInputError('analysis.paths.p50.returnPath is required');
  }

  const taxPolicy = createFederalTaxResolver(analysis.params, options);
  const federalTypical = runSinglePath(analysis.params, typical.returnPath, { taxPolicy });
  federalTypical.simIndex = typical.simIndex;
  federalTypical.returnPath = typical.returnPath;

  return {
    ...analysis,
    paths: {
      ...analysis.paths,
      p50: federalTypical,
    },
  };
}
