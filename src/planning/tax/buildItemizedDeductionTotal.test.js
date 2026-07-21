import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItemizedDeductionTotal } from './buildItemizedDeductionTotal.js';

const context = {
  calculatedAt: '2026-07-21T12:00:00.000Z',
  runId: 'itemized_total_test',
  scenarioId: 't9_itemized',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
};

test('filled demo itemized deductions reconcile to 70400', () => {
  const result = buildItemizedDeductionTotal({
    filingStatus: 'marriedFilingJointly',
    adjustedGrossIncome: 371250,
    context,
    deductions: [
      { typeId:'medical', amount:8000 },
      { typeId:'charitable', amount:12000 },
      { typeId:'mortgage_interest', amount:18400 },
      { typeId:'salt', amount:44800 },
    ],
  });

  assert.equal(result.enteredAmount, 83200);
  assert.equal(result.itemizedAmount, 70400);
  assert.equal(result.breakdown.medical.appliedAmount, 0);
  assert.equal(result.breakdown.salt.appliedAmount, 40000);
  assert.deepEqual(result.audits.map(audit => audit.ruleId), [
    'FED_MEDICAL_EXPENSE_DEDUCTION',
    'FED_SALT_DEDUCTION_CAP',
  ]);
});

test('SALT component rows roll up before applying one cap', () => {
  const result = buildItemizedDeductionTotal({
    filingStatus: 'marriedFilingJointly',
    adjustedGrossIncome: 100000,
    context,
    deductions: [
      { typeId:'salt', amount:20000 },
      { typeId:'real_estate_tax', amount:18000 },
      { typeId:'personal_property_tax', amount:6800 },
    ],
  });

  assert.equal(result.breakdown.salt.enteredAmount, 44800);
  assert.equal(result.breakdown.salt.appliedAmount, 40000);
  assert.equal(result.itemizedAmount, 40000);
});

test('medical expenses above the floor combine with direct deductions', () => {
  const result = buildItemizedDeductionTotal({
    filingStatus: 'marriedFilingJointly',
    adjustedGrossIncome: 100000,
    context,
    deductions: [
      { typeId:'medical', amount:10000 },
      { typeId:'charitable', amount:12000 },
    ],
  });

  assert.equal(result.breakdown.medical.appliedAmount, 2500);
  assert.equal(result.breakdown.direct.charitable.appliedAmount, 12000);
  assert.equal(result.itemizedAmount, 14500);
});
