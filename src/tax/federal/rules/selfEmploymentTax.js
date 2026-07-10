/* RULE: Schedule SE self-employment tax (FED_SELF_EMPLOYMENT_TAX) */

import {
  SELF_EMPLOYMENT_TAX,
  SELF_EMPLOYMENT_TAX_SOURCE,
} from '../../core/constants.js';
import {
  CONTEXT_SCHEMA,
  SELF_EMPLOYMENT_TAX_INPUT_SCHEMA,
} from '../../core/schemas.js';
import {
  assertNonNegativeNumber,
  validateAgainstSchema,
} from '../../core/validators.js';
import { getDataSource } from '../../core/dataSourceRegistry.js';
import { TaxDataError, TaxInputError } from '../../core/errors.js';

export const meta = {
  ruleId: 'FED_SELF_EMPLOYMENT_TAX',
  ruleVersion: '1.0.0',
  taxYear: 2025,
  lawVersion: '2025_FINAL',
  jurisdiction: 'federal',
  category: 'self_employment_tax',
  authority: ['IRS 2025 Schedule SE (Form 1040), Part I'],
  dataSourcesRequired: ['IRS_2025_SCHEDULE_SE_v1.0'],
  inputsRequired: ['netEarningsFromSelfEmployment', 'socialSecurityWagesAndTips'],
  outputs: [
    'socialSecurityTaxableEarnings',
    'socialSecurityTax',
    'medicareTax',
    'selfEmploymentTax',
  ],
  limitations: [
    'Expects resolved Schedule SE line 6 net earnings; does not reconstruct Schedule C, Schedule F, or optional-method income',
    'Calculates one person per invocation; joint returns must calculate each spouse separately and sum the results',
    'Uses whole-dollar return rounding for Schedule SE lines 10 through 12',
    'Does not calculate Additional Medicare Tax (Form 8959)',
  ],
  triggerTags: ['self_employment_tax'],
};

const roundDollar = (n) => Math.round(n + Number.EPSILON);

export function validate(input){
  validateAgainstSchema(input, SELF_EMPLOYMENT_TAX_INPUT_SCHEMA, 'selfEmploymentTax input');
  assertNonNegativeNumber(
    input.netEarningsFromSelfEmployment,
    'netEarningsFromSelfEmployment',
    'selfEmploymentTax input'
  );
  assertNonNegativeNumber(
    input.socialSecurityWagesAndTips,
    'socialSecurityWagesAndTips',
    'selfEmploymentTax input'
  );
  return input;
}

export function calculate(input, context){
  validate(input);
  validateAgainstSchema(context, CONTEXT_SCHEMA, 'context');

  const law = SELF_EMPLOYMENT_TAX[context.lawVersion];
  const dataSourceId = SELF_EMPLOYMENT_TAX_SOURCE[context.lawVersion];
  if(!law || !dataSourceId){
    throw new TaxDataError(`No self-employment tax data for lawVersion: ${context.lawVersion}`, {
      lawVersion: context.lawVersion,
    });
  }

  const dataSource = getDataSource(dataSourceId);
  if(context.taxYear !== dataSource.taxYear || context.lawVersion !== dataSource.lawVersion){
    throw new TaxInputError('context does not match the resolved self-employment tax data source', {
      contextTaxYear: context.taxYear,
      contextLawVersion: context.lawVersion,
      dataSourceTaxYear: dataSource.taxYear,
      dataSourceLawVersion: dataSource.lawVersion,
    });
  }

  const {
    taxpayer,
    netEarningsFromSelfEmployment,
    socialSecurityWagesAndTips,
  } = input;
  const remainingSocialSecurityWageBase = Math.max(
    0,
    law.socialSecurityWageBase - socialSecurityWagesAndTips
  );
  const socialSecurityTaxableEarnings = Math.min(
    netEarningsFromSelfEmployment,
    remainingSocialSecurityWageBase
  );
  const socialSecurityTax = roundDollar(
    socialSecurityTaxableEarnings * law.socialSecurityRate
  );
  const medicareTax = roundDollar(netEarningsFromSelfEmployment * law.medicareRate);
  const total = socialSecurityTax + medicareTax;

  const result = {
    remainingSocialSecurityWageBase,
    socialSecurityTaxableEarnings,
    socialSecurityTax,
    medicareTax,
    selfEmploymentTax: total,
  };

  const inputsUsed = {
    netEarningsFromSelfEmployment,
    socialSecurityWagesAndTips,
  };
  if(taxpayer !== undefined) inputsUsed.taxpayer = taxpayer;

  const audit = {
    ruleId: meta.ruleId,
    ruleVersion: meta.ruleVersion,
    taxYear: context.taxYear,
    lawVersion: context.lawVersion,
    calculatedAt: context.calculatedAt,
    runId: context.runId,
    scenarioId: context.scenarioId,
    inputsUsed,
    dataSourcesUsed: [dataSourceId],
    calculationSteps: [
      {
        scheduleSELine: 9,
        operation: 'remaining social security wage base',
        amount: remainingSocialSecurityWageBase,
      },
      {
        scheduleSELine: 10,
        rate: law.socialSecurityRate,
        earnings: socialSecurityTaxableEarnings,
        tax: socialSecurityTax,
      },
      {
        scheduleSELine: 11,
        rate: law.medicareRate,
        earnings: netEarningsFromSelfEmployment,
        tax: medicareTax,
      },
      {
        scheduleSELine: 12,
        operation: 'line 10 plus line 11',
        tax: total,
      },
    ],
    authority: meta.authority,
    limitations: meta.limitations,
  };

  return { result, audit };
}

export const selfEmploymentTax = { meta, validate, calculate };
