import { medicalExpenseDeduction } from '../../tax/federal/rules/medicalExpenseDeduction.js';
import { saltDeductionCap } from '../../tax/federal/rules/saltDeductionCap.js';

export const SALT_DEDUCTION_TYPE_IDS = Object.freeze([
  'salt', 'real_estate_tax', 'personal_property_tax',
]);

const saltTypes = new Set(SALT_DEDUCTION_TYPE_IDS);
const round2 = number => Math.round((number + Number.EPSILON) * 100) / 100;
const amountOf = row => Math.max(0, Number(row?.amount) || 0);

/**
 * Planner glue only: aggregate plan deduction rows, call federal rules, and
 * return the Schedule A amount consumed by the existing 1040 intake path.
 */
export function buildItemizedDeductionTotal({
  deductions = [],
  adjustedGrossIncome,
  filingStatus,
  context,
}){
  if(!Array.isArray(deductions)) throw new TypeError('deductions must be an array');

  let medicalEntered = 0;
  let saltEntered = 0;
  let directApplied = 0;
  const directByType = {};

  for(const row of deductions){
    const typeId = row?.typeId || 'other';
    const amount = amountOf(row);
    if(typeId === 'medical') medicalEntered += amount;
    else if(saltTypes.has(typeId)) saltEntered += amount;
    else{
      directApplied += amount;
      directByType[typeId] = round2((directByType[typeId] || 0) + amount);
    }
  }

  const audits = [];
  let medical = {
    enteredAmount: round2(medicalEntered),
    appliedAmount: 0,
    floorRate: null,
    floorAmount: null,
    disallowedAmount: 0,
  };
  if(medicalEntered > 0){
    const calculated = medicalExpenseDeduction.calculate({
      adjustedGrossIncome,
      medicalExpenses: medicalEntered,
    }, context);
    audits.push(calculated.audit);
    medical = {
      enteredAmount: calculated.result.enteredMedicalExpenses,
      appliedAmount: calculated.result.deductibleMedicalExpenses,
      floorRate: calculated.result.medicalExpenseFloorRate,
      floorAmount: calculated.result.medicalExpenseFloor,
      disallowedAmount: calculated.result.disallowedMedicalExpenses,
    };
  }

  let salt = {
    enteredAmount: round2(saltEntered),
    appliedAmount: 0,
    capAmount: null,
    disallowedAmount: 0,
    componentTypeIds: [...SALT_DEDUCTION_TYPE_IDS],
  };
  if(saltEntered > 0){
    const calculated = saltDeductionCap.calculate({
      filingStatus,
      enteredSaltTotal: saltEntered,
    }, context);
    audits.push(calculated.audit);
    salt = {
      enteredAmount: calculated.result.enteredSaltTotal,
      appliedAmount: calculated.result.deductibleSalt,
      capAmount: calculated.result.saltCap,
      disallowedAmount: calculated.result.disallowedSalt,
      componentTypeIds: [...SALT_DEDUCTION_TYPE_IDS],
    };
  }

  const direct = Object.fromEntries(Object.entries(directByType).map(([typeId, enteredAmount]) => [
    typeId,
    { enteredAmount, appliedAmount: enteredAmount },
  ]));
  const itemizedAmount = round2(directApplied + medical.appliedAmount + salt.appliedAmount);
  const enteredAmount = round2(directApplied + medical.enteredAmount + salt.enteredAmount);

  return {
    enteredAmount,
    itemizedAmount,
    breakdown: { medical, salt, direct },
    audits,
  };
}
