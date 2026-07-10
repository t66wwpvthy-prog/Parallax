/* Build adapter planMeta from resolved engine params (plain data — no engine.js import). */

import { TaxInputError } from '../../tax/core/errors.js';
import { supportedTaxYears } from '../../tax/core/lawRegistry.js';

function assertPlainObject(value, label){
  if(value === null || typeof value !== 'object' || Array.isArray(value)){
    throw new TaxInputError(`${label} must be a plain object`, { received: typeof value });
  }
}

function resolveTaxableGainFraction(params, options){
  if(options.taxableGainFraction !== undefined){
    return options.taxableGainFraction;
  }
  const taxable = params.accounts?.taxable;
  if(!taxable || !(taxable.balance > 0)) return undefined;
  const basis = taxable.basis ?? 0;
  return Math.max(0, Math.min(1, 1 - basis / taxable.balance));
}

/**
 * Shared planMeta for runTaxForScenarioPath from analyzeResults().params.
 *
 * options.filingStatus — explicit household filing status (required unless present in params.meta)
 * options.baseTaxYear — calendar tax year for row.year === 1; later years increment
 * options.deductions — defaults to standard deduction
 * options.resolved — optional taxable-portion overrides for adapter
 */
export function buildPlanMetaFromEngineParams(params, options = {}){
  assertPlainObject(params, 'params');
  assertPlainObject(options, 'options');

  const filingStatus = options.filingStatus
    ?? params.meta?.filingStatus
    ?? params.filingStatus;
  if(filingStatus === undefined || filingStatus === null){
    throw new TaxInputError('planner tax attachment is missing plan.meta.filingStatus', {
      field: 'filingStatus',
    });
  }

  const planMeta = {
    filingStatus,
    deductions: options.deductions ?? { useStandard: true },
    treatWithdrawalsAsFullyTaxable: options.treatWithdrawalsAsFullyTaxable !== false,
  };

  const taxableGainFraction = resolveTaxableGainFraction(params, options);
  if(taxableGainFraction !== undefined){
    planMeta.taxableGainFraction = taxableGainFraction;
  }

  if(options.wages !== undefined) planMeta.wages = options.wages;
  if(options.resolved) planMeta.resolved = { ...options.resolved };
  if(options.taxYear !== undefined) planMeta.taxYear = options.taxYear;

  return planMeta;
}

/** Per-row taxYear when baseTaxYear tracks simulation row.year (clamped to supported law). */
export function buildRowPlanMetaFromOptions(options = {}){
  if(options.baseTaxYear == null) return null;
  const supported = supportedTaxYears();
  const minYear = supported[0];
  const maxYear = supported[supported.length - 1];
  const baseTaxYear = options.baseTaxYear;
  return (row) => {
    const raw = baseTaxYear + (row.year ?? 1) - 1;
    return { taxYear: Math.max(minYear, Math.min(maxYear, raw)) };
  };
}
