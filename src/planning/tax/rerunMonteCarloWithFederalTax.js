/* Planning-owned full-MC rerun: preserve shortcut aggregates, replace sim tax reporting. */

import { runSinglePath } from '../../../engine.js';
import { TaxInputError } from '../../tax/core/errors.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';

const PATH_KEYS = ['p10', 'p25', 'p50', 'p75', 'p90'];

function assertSim(sim, label){
  if(sim === null || typeof sim !== 'object' || Array.isArray(sim)){
    throw new TaxInputError(`${label} must be a plain object`);
  }
  if(!Number.isInteger(sim.simIndex) || sim.simIndex < 0){
    throw new TaxInputError(`${label}.simIndex must be a non-negative integer`);
  }
  if(!Array.isArray(sim.returnPath)){
    throw new TaxInputError(`${label}.returnPath is required`);
  }
}

/**
 * Re-run every Monte Carlo sim with federal Form 1040 line 24 as reported
 * row.taxes. The shortcut analysis remains the source for success rate,
 * terminal distribution, envelope, metrics, and medianLifetimeTax.
 *
 * Engine analyses share the exact returnPath array between a sim and any
 * selected percentile path that references it. The nested maps therefore
 * dedupe on both coherence anchors: simIndex and returnPath identity.
 */
export function rerunMonteCarloWithFederalTax(analysis, options = {}){
  if(analysis === null || typeof analysis !== 'object' || Array.isArray(analysis)){
    throw new TaxInputError('analysis must be a plain object');
  }
  if(analysis.params === null || typeof analysis.params !== 'object' || Array.isArray(analysis.params)){
    throw new TaxInputError('analysis.params is required');
  }
  if(!Array.isArray(analysis.sims) || analysis.sims.length === 0){
    throw new TaxInputError('analysis.sims is required');
  }

  const taxPolicy = createFederalTaxResolver(analysis.params, options);
  const federalBySimIndex = new Map();

  const getOrRunFederalSim = (sim, label) => {
    assertSim(sim, label);
    let byReturnPath = federalBySimIndex.get(sim.simIndex);
    if(!byReturnPath){
      byReturnPath = new Map();
      federalBySimIndex.set(sim.simIndex, byReturnPath);
    }
    let federalSim = byReturnPath.get(sim.returnPath);
    if(!federalSim){
      federalSim = runSinglePath(analysis.params, sim.returnPath, { taxPolicy });
      federalSim.simIndex = sim.simIndex;
      federalSim.returnPath = sim.returnPath;
      byReturnPath.set(sim.returnPath, federalSim);
    }
    return federalSim;
  };

  const federalSims = analysis.sims.map((sim, index) =>
    getOrRunFederalSim(sim, `analysis.sims[${index}]`)
  );

  const federalPaths = {};
  for(const pathKey of PATH_KEYS){
    const selected = analysis.paths?.[pathKey];
    assertSim(selected, `analysis.paths.${pathKey}`);
    const federalPath = federalBySimIndex.get(selected.simIndex)?.get(selected.returnPath);
    if(!federalPath){
      throw new TaxInputError(
        `analysis.paths.${pathKey} must reference analysis.sims by simIndex and returnPath`
      );
    }
    federalPaths[pathKey] = federalPath;
  }

  const federalLifetimeTaxes = federalSims
    .map((sim) => sim.lifetimeTax)
    .sort((a, b) => a - b);
  const federalMedianLifetimeTax =
    federalLifetimeTaxes[Math.floor(federalLifetimeTaxes.length * 0.50)];

  return {
    ...analysis,
    paths: {
      ...analysis.paths,
      ...federalPaths,
    },
    sims: federalSims,
    federalMedianLifetimeTax,
  };
}
