/* RULE: Federal Medical Expense Deduction (FED_MEDICAL_EXPENSE_DEDUCTION) */

import {
  MEDICAL_EXPENSE_AGI_FLOOR,
  MEDICAL_EXPENSE_AGI_FLOOR_SOURCE,
} from '../../core/itemizedDeductionConstants.js';
import { CONTEXT_SCHEMA } from '../../core/schemas.js';
import { MEDICAL_EXPENSE_DEDUCTION_INPUT_SCHEMA } from '../../core/itemizedDeductionSchemas.js';
import { validateAgainstSchema, assertNonNegativeNumber } from '../../core/validators.js';
import { getDataSource } from '../../core/dataSourceRegistry.js';
import { TaxDataError, TaxInputError } from '../../core/errors.js';

export const meta = {
  ruleId: 'FED_MEDICAL_EXPENSE_DEDUCTION',
  ruleVersion: '1.0.0',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
  jurisdiction: 'federal',
  category: 'itemized_deduction',
  authority: ['IRC section 213(a)'],
  dataSourcesRequired: ['IRC_213_MEDICAL_EXPENSE_FLOOR_v1.0'],
  inputsRequired: ['adjustedGrossIncome', 'medicalExpenses'],
  outputs: [
    'deductibleMedicalExpenses', 'medicalExpenseFloor', 'medicalExpenseFloorRate',
    'disallowedMedicalExpenses',
  ],
  limitations: [
    'Assumes entered expenses are otherwise qualified medical expenses',
    'Does not determine reimbursement, timing, or taxpayer/dependent eligibility',
  ],
  triggerTags: ['agi_threshold'],
};

const round2 = number => Math.round((number + Number.EPSILON) * 100) / 100;

export function validate(input){
  validateAgainstSchema(input, MEDICAL_EXPENSE_DEDUCTION_INPUT_SCHEMA, 'medicalExpenseDeduction input');
  assertNonNegativeNumber(input.adjustedGrossIncome, 'adjustedGrossIncome', 'medicalExpenseDeduction input');
  assertNonNegativeNumber(input.medicalExpenses, 'medicalExpenses', 'medicalExpenseDeduction input');
  return input;
}

function resolveFloorRate(context){
  const rate = MEDICAL_EXPENSE_AGI_FLOOR[context.lawVersion];
  if(rate === undefined){
    throw new TaxDataError(`No medical expense AGI floor for lawVersion: ${context.lawVersion}`, {
      lawVersion: context.lawVersion,
    });
  }
  const dataSourceId = MEDICAL_EXPENSE_AGI_FLOOR_SOURCE[context.lawVersion];
  const dataSource = getDataSource(dataSourceId);
  if(context.lawVersion !== dataSource.lawVersion || context.taxYear !== dataSource.taxYear){
    throw new TaxInputError('context does not match the medical expense deduction data source', {
      contextLawVersion: context.lawVersion,
      contextTaxYear: context.taxYear,
    });
  }
  return { rate, dataSourceId };
}

export function calculate(input, context){
  validate(input);
  validateAgainstSchema(context, CONTEXT_SCHEMA, 'context');

  const { rate, dataSourceId } = resolveFloorRate(context);
  const medicalExpenseFloor = round2(input.adjustedGrossIncome * rate);
  const deductibleMedicalExpenses = round2(Math.max(0, input.medicalExpenses - medicalExpenseFloor));
  const disallowedMedicalExpenses = round2(input.medicalExpenses - deductibleMedicalExpenses);

  const result = {
    enteredMedicalExpenses: input.medicalExpenses,
    adjustedGrossIncome: input.adjustedGrossIncome,
    medicalExpenseFloorRate: rate,
    medicalExpenseFloor,
    deductibleMedicalExpenses,
    disallowedMedicalExpenses,
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
    calculationSteps: [
      { operation: 'AGI_FLOOR', adjustedGrossIncome: input.adjustedGrossIncome, rate, amount: medicalExpenseFloor },
      { operation: 'EXCESS_OVER_FLOOR', entered: input.medicalExpenses, deductible: deductibleMedicalExpenses },
    ],
    authority: meta.authority,
    limitations: meta.limitations,
  };

  return { result, audit };
}

export const medicalExpenseDeduction = { meta, validate, calculate };
