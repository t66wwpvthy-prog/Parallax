/* Validate client 1040 intake before compose. */

import { readIntakeField } from '../core/1040BasicLineMap.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function pushError(errors, code, message){
  errors.push({ code, message });
}

function pushWarning(warnings, code, message){
  warnings.push({ code, message });
}

function assertNonNegative(errors, value, label){
  if(value === undefined || value === null) return;
  if(typeof value !== 'number' || Number.isNaN(value)){
    pushError(errors, 'INVALID_NUMBER', `${label} must be a number`);
    return;
  }
  if(value < 0) pushError(errors, 'NEGATIVE_AMOUNT', `${label} cannot be negative`);
}

export function validateClient1040Intake(intake){
  const errors = [];
  const warnings = [];

  if(!intake || typeof intake !== 'object' || Array.isArray(intake)){
    pushError(errors, 'INVALID_INTAKE', 'intake must be a plain object');
    return { errors, warnings };
  }

  if(!intake.filingStatus){
    pushError(errors, 'MISSING_FILING_STATUS', 'filingStatus is required');
  }

  const wages = readIntakeField(intake, 'income.wages');
  const ordinaryDividends = readIntakeField(intake, 'income.ordinaryDividends');
  const qualifiedDividends = readIntakeField(intake, 'income.qualifiedDividends');
  const itemized = intake.deductions?.itemizedAmount;
  const useStandard = intake.deductions?.useStandard;

  assertNonNegative(errors, wages, 'income.wages');
  assertNonNegative(errors, ordinaryDividends, 'income.ordinaryDividends');
  assertNonNegative(errors, qualifiedDividends, 'income.qualifiedDividends');
  assertNonNegative(errors, itemized, 'deductions.itemizedAmount');

  if(qualifiedDividends !== undefined && ordinaryDividends !== undefined
      && qualifiedDividends > ordinaryDividends){
    pushError(errors, 'QD_EXCEEDS_ORDINARY', 'income.qualifiedDividends cannot exceed income.ordinaryDividends');
  }

  if(useStandard === true && itemized !== undefined){
    pushError(errors, 'DEDUCTION_CONFLICT', 'deductions.useStandard and deductions.itemizedAmount are contradictory');
  }

  if(intake.taxYear !== undefined && typeof intake.taxYear !== 'number'){
    pushError(errors, 'INVALID_TAX_YEAR', 'taxYear must be a number');
  }

  if(intake.passThrough){
    for(const lineId of ['line11a', 'line15', 'line17', 'line19', 'line20', 'line23']){
      const value = intake.passThrough[lineId];
      if(value === undefined) continue;
      if(typeof value !== 'number' || Number.isNaN(value)){
        pushError(errors, 'INVALID_PASS_THROUGH', `passThrough.${lineId} must be a number`);
      }
    }
  }

  if(intake.scheduleD && typeof intake.scheduleD !== 'object'){
    pushWarning(warnings, 'SCHEDULE_D_SHAPE', 'scheduleD should be an object when supplied');
  }

  return { errors, warnings };
}

export function applyValidationWarnings(warnings, intake, result){
  const expectedAgi = intake.passThrough?.line11a;
  if(expectedAgi !== undefined && result.form1040.line11a?.value !== undefined){
    const computed = result.form1040.line11a.value;
    if(round2(expectedAgi) !== round2(computed)){
      pushWarning(warnings, 'AGI_MISMATCH',
        `passThrough.line11a (${expectedAgi}) differs from calculated line11a (${computed})`);
    }
  }

  const expectedTaxable = intake.passThrough?.line15;
  if(expectedTaxable !== undefined && result.form1040.line15?.value !== undefined){
    const computed = result.form1040.line15.value;
    if(round2(expectedTaxable) !== round2(computed)){
      pushWarning(warnings, 'TAXABLE_INCOME_MISMATCH',
        `passThrough.line15 (${expectedTaxable}) differs from calculated line15 (${computed})`);
    }
  }
}
