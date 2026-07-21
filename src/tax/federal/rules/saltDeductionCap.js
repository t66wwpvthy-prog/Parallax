/* RULE: Federal SALT Deduction Cap (FED_SALT_DEDUCTION_CAP) */

import { FILING_STATUSES } from '../../core/constants.js';
import {
  SALT_DEDUCTION_CAP,
  SALT_DEDUCTION_CAP_SOURCE,
} from '../../core/itemizedDeductionConstants.js';
import { CONTEXT_SCHEMA } from '../../core/schemas.js';
import { SALT_DEDUCTION_CAP_INPUT_SCHEMA } from '../../core/itemizedDeductionSchemas.js';
import { validateAgainstSchema, assertNonNegativeNumber, assertOneOf } from '../../core/validators.js';
import { getDataSource } from '../../core/dataSourceRegistry.js';
import { TaxDataError, TaxInputError } from '../../core/errors.js';

export const meta = {
  ruleId: 'FED_SALT_DEDUCTION_CAP',
  ruleVersion: '1.0.0',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
  jurisdiction: 'federal',
  category: 'itemized_deduction',
  authority: ['IRC section 164(b)(6)', 'Parallax T9 2026 product lock'],
  dataSourcesRequired: ['IRC_164_SALT_CAP_2026_DEMO_v1.0'],
  inputsRequired: ['filingStatus', 'enteredSaltTotal'],
  outputs: ['deductibleSalt', 'saltCap', 'disallowedSalt'],
  limitations: [
    'Implements the locked $40,000 married-filing-jointly cap only',
    'Does not model the high-income SALT cap phase-down',
    'Does not determine whether entered taxes are otherwise deductible',
  ],
  triggerTags: [],
};

const round2 = number => Math.round((number + Number.EPSILON) * 100) / 100;

export function validate(input){
  validateAgainstSchema(input, SALT_DEDUCTION_CAP_INPUT_SCHEMA, 'saltDeductionCap input');
  assertOneOf(input.filingStatus, FILING_STATUSES, 'filingStatus', 'saltDeductionCap input');
  assertNonNegativeNumber(input.enteredSaltTotal, 'enteredSaltTotal', 'saltDeductionCap input');
  return input;
}

function resolveCap(context, filingStatus){
  const table = SALT_DEDUCTION_CAP[context.lawVersion];
  if(!table){
    throw new TaxDataError(`No SALT deduction cap table for lawVersion: ${context.lawVersion}`, {
      lawVersion: context.lawVersion,
    });
  }
  const cap = table[filingStatus];
  if(cap === undefined){
    throw new TaxDataError(`No SALT deduction cap for filingStatus: ${filingStatus}`, {
      lawVersion: context.lawVersion,
      filingStatus,
    });
  }
  const dataSourceId = SALT_DEDUCTION_CAP_SOURCE[context.lawVersion];
  const dataSource = getDataSource(dataSourceId);
  if(context.lawVersion !== dataSource.lawVersion || context.taxYear !== dataSource.taxYear){
    throw new TaxInputError('context does not match the SALT deduction cap data source', {
      contextLawVersion: context.lawVersion,
      contextTaxYear: context.taxYear,
    });
  }
  return { cap, dataSourceId };
}

export function calculate(input, context){
  validate(input);
  validateAgainstSchema(context, CONTEXT_SCHEMA, 'context');

  const { cap, dataSourceId } = resolveCap(context, input.filingStatus);
  const deductibleSalt = round2(Math.min(input.enteredSaltTotal, cap));
  const disallowedSalt = round2(input.enteredSaltTotal - deductibleSalt);

  const result = {
    filingStatus: input.filingStatus,
    enteredSaltTotal: input.enteredSaltTotal,
    saltCap: cap,
    deductibleSalt,
    disallowedSalt,
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
    calculationSteps: [{ operation: 'APPLY_CAP', entered: input.enteredSaltTotal, cap, deductible: deductibleSalt }],
    authority: meta.authority,
    limitations: meta.limitations,
  };

  return { result, audit };
}

export const saltDeductionCap = { meta, validate, calculate };
