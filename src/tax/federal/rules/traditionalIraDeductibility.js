/* RULE: Traditional IRA Deductibility (FED_TRADITIONAL_IRA_DEDUCTIBILITY) */

import {
  FILING_STATUSES,
  TRADITIONAL_IRA_LIMITS,
  TRADITIONAL_IRA_LIMITS_SOURCE,
} from '../../core/constants.js';
import { CONTEXT_SCHEMA, TRADITIONAL_IRA_DEDUCTIBILITY_INPUT_SCHEMA } from '../../core/schemas.js';
import { validateAgainstSchema, assertNonNegativeNumber, assertOneOf } from '../../core/validators.js';
import { getDataSource } from '../../core/dataSourceRegistry.js';
import { TaxDataError, TaxInputError } from '../../core/errors.js';

export const meta = {
  ruleId: 'FED_TRADITIONAL_IRA_DEDUCTIBILITY',
  ruleVersion: '1.0.0',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
  jurisdiction: 'federal',
  category: 'ira_deductibility',
  authority: ['IRC section 219', 'IRS Notice 2025-67', 'IRS Publication 590-A'],
  dataSourcesRequired: ['IRS_2026_IRA_LIMITS_v1.0'],
  inputsRequired: [
    'filingStatus', 'modifiedAgi', 'contributionAmount', 'age', 'taxableCompensation',
    'taxpayerCoveredByWorkplacePlan', 'spouseCoveredByWorkplacePlan', 'livedWithSpouse',
  ],
  outputs: ['deductibleContribution', 'nondeductibleContribution', 'allowableContribution', 'excessContribution', 'phaseoutRange'],
  limitations: ['Does not solve Social Security / IRA circular worksheets'],
  triggerTags: ['ira_deductibility', 'retirement_contribution', 'agi_threshold'],
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round6 = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const roundUpToNext10 = (n) => Math.ceil((n - Number.EPSILON) / 10) * 10;

export function validate(input){
  validateAgainstSchema(input, TRADITIONAL_IRA_DEDUCTIBILITY_INPUT_SCHEMA, 'traditionalIraDeductibility input');
  assertOneOf(input.filingStatus, FILING_STATUSES, 'filingStatus', 'traditionalIraDeductibility input');
  assertNonNegativeNumber(input.modifiedAgi, 'modifiedAgi', 'traditionalIraDeductibility input');
  assertNonNegativeNumber(input.contributionAmount, 'contributionAmount', 'traditionalIraDeductibility input');
  assertNonNegativeNumber(input.age, 'age', 'traditionalIraDeductibility input');
  assertNonNegativeNumber(input.taxableCompensation, 'taxableCompensation', 'traditionalIraDeductibility input');
  return input;
}

function resolveLimits(context){
  const limits = TRADITIONAL_IRA_LIMITS[context.lawVersion];
  if(!limits){
    throw new TaxDataError(`No Traditional IRA limit table for lawVersion: ${context.lawVersion}`, {
      lawVersion: context.lawVersion,
    });
  }
  const dataSourceId = TRADITIONAL_IRA_LIMITS_SOURCE[context.lawVersion];
  const dataSource = getDataSource(dataSourceId);
  if(context.lawVersion !== dataSource.lawVersion || context.taxYear !== dataSource.taxYear){
    throw new TaxInputError('context does not match Traditional IRA data source', {
      contextLawVersion: context.lawVersion,
    });
  }
  return { limits, dataSourceId };
}

function activeParticipantRange(limits, filingStatus, livedWithSpouse){
  if(filingStatus === 'marriedFilingSeparately' && !livedWithSpouse){
    return limits.phaseouts.activeParticipant.single;
  }
  return limits.phaseouts.activeParticipant[filingStatus] || null;
}

function spouseActiveRange(limits, filingStatus, livedWithSpouse){
  if(filingStatus === 'marriedFilingJointly') return limits.phaseouts.spouseActiveParticipant.marriedFilingJointly;
  if(filingStatus === 'marriedFilingSeparately' && livedWithSpouse){
    return limits.phaseouts.spouseActiveParticipant.marriedFilingSeparately;
  }
  return null;
}

function selectPhaseoutRange(input, limits){
  if(input.taxpayerCoveredByWorkplacePlan){
    return {
      coverageType: 'taxpayer_active_participant',
      phaseoutRange: activeParticipantRange(limits, input.filingStatus, input.livedWithSpouse),
    };
  }
  if(input.spouseCoveredByWorkplacePlan){
    return {
      coverageType: 'spouse_active_participant',
      phaseoutRange: spouseActiveRange(limits, input.filingStatus, input.livedWithSpouse),
    };
  }
  return { coverageType: 'not_covered', phaseoutRange: null };
}

function calculateDeductionLimit(maxContribution, modifiedAgi, phaseoutRange){
  if(!phaseoutRange) return { deductionLimit: maxContribution, phaseoutStatus: 'not_applicable' };
  const { fullDeductionUpTo, noDeductionAtOrAbove } = phaseoutRange;

  if(modifiedAgi <= fullDeductionUpTo) return { deductionLimit: maxContribution, phaseoutStatus: 'full' };
  if(modifiedAgi >= noDeductionAtOrAbove) return { deductionLimit: 0, phaseoutStatus: 'none' };

  const phaseoutWidth = noDeductionAtOrAbove - fullDeductionUpTo;
  const remainingRange = noDeductionAtOrAbove - modifiedAgi;
  let reducedLimit = roundUpToNext10((remainingRange / phaseoutWidth) * maxContribution);
  if(reducedLimit > 0 && reducedLimit < 200) reducedLimit = 200;
  return { deductionLimit: Math.min(maxContribution, reducedLimit), phaseoutStatus: 'partial' };
}

export function calculate(input, context){
  validate(input);
  validateAgainstSchema(context, CONTEXT_SCHEMA, 'context');

  const { limits, dataSourceId } = resolveLimits(context);
  const maxContribution = limits.baseContributionLimit + (input.age >= limits.catchUpAge ? limits.catchUpContribution : 0);
  const allowableContribution = round2(Math.min(input.contributionAmount, input.taxableCompensation, maxContribution));
  const excessContribution = round2(Math.max(0, input.contributionAmount - allowableContribution));
  const { coverageType, phaseoutRange } = selectPhaseoutRange(input, limits);
  const deductionCalc = calculateDeductionLimit(maxContribution, input.modifiedAgi, phaseoutRange);
  const deductibleContribution = round2(Math.min(allowableContribution, deductionCalc.deductionLimit));
  const nondeductibleContribution = round2(Math.max(0, allowableContribution - deductibleContribution));
  const deductionPct = allowableContribution > 0 ? round6(deductibleContribution / allowableContribution) : 0;

  const result = {
    deductibleContribution,
    nondeductibleContribution,
    allowableContribution,
    excessContribution,
    deductionPct,
    maxContribution,
    coverageType,
    phaseoutStatus: deductionCalc.phaseoutStatus,
    phaseoutRange,
  };

  const audit = {
    ruleId: meta.ruleId,
    ruleVersion: meta.ruleVersion,
    taxYear: context.taxYear,
    lawVersion: context.lawVersion,
    calculatedAt: context.calculatedAt,
    runId: context.runId,
    scenarioId: context.scenarioId,
    inputsUsed: { ...input },
    dataSourcesUsed: [dataSourceId],
    calculationSteps: [{ deductibleContribution, allowableContribution, coverageType }],
    authority: meta.authority,
    limitations: meta.limitations,
  };

  return { result, audit };
}

export const traditionalIraDeductibility = { meta, validate, calculate };
