/* ============================================================================
   RULE: Federal Standard Deduction (FED_STANDARD_DEDUCTION)

   Returns the base standard deduction for a filing status. Does not apply
   line 12a–12d adjustments (dependent, spouse itemizes, dual-status, age/blind).
   ============================================================================ */

import {
  FILING_STATUSES,
  STANDARD_DEDUCTION,
  STANDARD_DEDUCTION_SOURCE,
} from '../../core/constants.js';
import { CONTEXT_SCHEMA, STANDARD_DEDUCTION_INPUT_SCHEMA } from '../../core/schemas.js';
import { validateAgainstSchema, assertOneOf } from '../../core/validators.js';
import { getDataSource } from '../../core/dataSourceRegistry.js';
import { TaxDataError, TaxInputError } from '../../core/errors.js';

export const meta = {
  ruleId: 'FED_STANDARD_DEDUCTION',
  ruleVersion: '1.0.0',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
  jurisdiction: 'federal',
  category: 'standard_deduction',
  authority: ['IRC section 63(c)', 'IRS Form 1040 (2025) standard deduction table'],
  dataSourcesRequired: ['IRS_2026_STANDARD_DEDUCTION_v1.0'],
  inputsRequired: ['filingStatus'],
  outputs: ['standardDeduction'],
  limitations: [
    'Does not apply line 12a dependent checkbox reductions',
    'Does not apply line 12b spouse itemizes on separate return',
    'Does not apply line 12c dual-status alien rules',
    'Does not apply line 12d additional amounts for age or blindness',
  ],
  triggerTags: ['standard_deduction', 'agi_threshold'],
};

export function validate(input){
  validateAgainstSchema(input, STANDARD_DEDUCTION_INPUT_SCHEMA, 'standardDeduction input');
  assertOneOf(input.filingStatus, FILING_STATUSES, 'filingStatus', 'standardDeduction input');
  return input;
}

function resolveAmount(context, filingStatus){
  const table = STANDARD_DEDUCTION[context.lawVersion];
  if(!table){
    throw new TaxDataError(`No standard deduction table for lawVersion: ${context.lawVersion}`, {
      lawVersion: context.lawVersion,
    });
  }
  const amount = table[filingStatus];
  if(amount === undefined){
    throw new TaxDataError(`No standard deduction for filingStatus: ${filingStatus}`, {
      lawVersion: context.lawVersion,
      filingStatus,
    });
  }

  const dataSourceId = STANDARD_DEDUCTION_SOURCE[context.lawVersion];
  if(!dataSourceId){
    throw new TaxDataError(`No standard deduction data source mapped for lawVersion: ${context.lawVersion}`, {
      lawVersion: context.lawVersion,
    });
  }
  const dataSource = getDataSource(dataSourceId);
  if(context.lawVersion !== dataSource.lawVersion){
    throw new TaxInputError('context.lawVersion does not match the resolved standard deduction data source', {
      contextLawVersion: context.lawVersion,
      dataSourceLawVersion: dataSource.lawVersion,
    });
  }
  if(context.taxYear !== dataSource.taxYear){
    throw new TaxInputError('context.taxYear does not match the resolved standard deduction data source tax year', {
      contextTaxYear: context.taxYear,
      dataSourceTaxYear: dataSource.taxYear,
    });
  }

  return { amount, dataSourceId };
}

export function calculate(input, context){
  validate(input);
  validateAgainstSchema(context, CONTEXT_SCHEMA, 'context');

  const { amount, dataSourceId } = resolveAmount(context, input.filingStatus);

  const result = { standardDeduction: amount };

  const audit = {
    ruleId: meta.ruleId,
    ruleVersion: meta.ruleVersion,
    taxYear: context.taxYear,
    lawVersion: context.lawVersion,
    calculatedAt: context.calculatedAt,
    runId: context.runId,
    scenarioId: context.scenarioId,
    inputsUsed: { filingStatus: input.filingStatus },
    dataSourcesUsed: [dataSourceId],
    calculationSteps: [{ filingStatus: input.filingStatus, standardDeduction: amount }],
    authority: meta.authority,
    limitations: meta.limitations,
  };

  return { result, audit };
}

export const standardDeduction = { meta, validate, calculate };
