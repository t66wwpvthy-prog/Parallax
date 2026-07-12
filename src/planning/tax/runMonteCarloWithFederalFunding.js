/* Planning-owned federal-funding MC sidecar; shortcut aggregates remain authoritative. */

import { runSimulation } from '../../../engine.js';
import { TaxInputError } from '../../tax/core/errors.js';
import { buildFederalFundingPathSidecar } from './buildFederalFundingPathSidecar.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';

function assertHouseholdTaxOptions(shortcutAnalysis, plan, options){
  const planFilingStatus = plan?.meta?.filingStatus;
  const shortcutFilingStatus = shortcutAnalysis.params?.meta?.filingStatus
    ?? shortcutAnalysis.params?.filingStatus;
  const optionFilingStatus = options?.filingStatus;
  if(!planFilingStatus
    || (shortcutFilingStatus !== undefined
      && shortcutFilingStatus !== null
      && shortcutFilingStatus !== planFilingStatus)){
    throw new TaxInputError(
      'federal funding filing status must match Household and shortcut inputs',
      { planFilingStatus: planFilingStatus ?? null, shortcutFilingStatus: shortcutFilingStatus ?? null }
    );
  }
  if(optionFilingStatus !== undefined && optionFilingStatus !== planFilingStatus){
    throw new TaxInputError(
      'federal funding filingStatus override conflicts with Household',
      { planFilingStatus, optionFilingStatus }
    );
  }
  const hasSpouse = Boolean(plan?.household?.spouse);
  if((planFilingStatus === 'marriedFilingJointly' && !hasSpouse)
    || (hasSpouse && planFilingStatus !== 'marriedFilingJointly')){
    throw new TaxInputError(
      'federal funding cannot combine co-client facts on the selected filing status',
      { planFilingStatus, hasSpouse }
    );
  }
  if(options?.taxableGainFraction !== undefined){
    throw new TaxInputError(
      'federal funding must use each engine row taxableGainFraction; path-wide override is unsupported',
      { taxableGainFraction: options.taxableGainFraction }
    );
  }
  if(options?.treatWithdrawalsAsFullyTaxable === false){
    throw new TaxInputError(
      'federal funding cannot override Traditional withdrawal tax character before distribution rules exist'
    );
  }
  if(options?.resolved !== undefined){
    throw new TaxInputError(
      'federal funding cannot override resolved taxable portions before distribution rules exist'
    );
  }
}

/**
 * Re-run the exact shortcut Monte Carlo return paths with federal Form 1040
 * line 24 driving positive tax-delta funding. A compact sidecar preserves the
 * funded bucket paths while shortcut aggregates remain unchanged.
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
  assertHouseholdTaxOptions(shortcutAnalysis, plan, options);

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
  const federalFunding = buildFederalFundingPathSidecar(
    shortcutAnalysis,
    federalAnalysis,
    plan,
    overrides,
    options
  );

  return {
    ...shortcutAnalysis,
    federalSuccessRate: federalFunding.successRate,
    federalFunding,
  };
}
