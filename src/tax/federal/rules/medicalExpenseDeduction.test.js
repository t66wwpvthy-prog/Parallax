import test from 'node:test';
import assert from 'node:assert/strict';
import { medicalExpenseDeduction, meta } from './medicalExpenseDeduction.js';

const ctx = () => ({
  calculatedAt: '2026-07-21T12:00:00.000Z',
  runId: 'medical_expense_test',
  scenarioId: 't9_itemized',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

test('medical expense deduction meta contract', () => {
  assert.equal(meta.ruleId, 'FED_MEDICAL_EXPENSE_DEDUCTION');
  assert.ok(meta.dataSourcesRequired.includes('IRC_213_MEDICAL_EXPENSE_FLOOR_v1.0'));
});

test('medical expense deduction applies the 7.5% AGI floor', () => {
  const cases = [
    [{ adjustedGrossIncome:371250, medicalExpenses:8000 }, 0, 27843.75],
    [{ adjustedGrossIncome:371250, medicalExpenses:30000 }, 2156.25, 27843.75],
    [{ adjustedGrossIncome:100000, medicalExpenses:10000 }, 2500, 7500],
  ];
  for(const [input, expectedDeduction, expectedFloor] of cases){
    const { result } = medicalExpenseDeduction.calculate(input, ctx());
    assert.equal(result.deductibleMedicalExpenses, expectedDeduction);
    assert.equal(result.medicalExpenseFloor, expectedFloor);
  }
});

test('medical expense deduction audit is serializable and cites the source', () => {
  const { audit } = medicalExpenseDeduction.calculate({
    adjustedGrossIncome: 100000,
    medicalExpenses: 10000,
  }, ctx());
  assert.doesNotThrow(() => JSON.stringify(audit));
  assert.ok(audit.dataSourcesUsed.includes('IRC_213_MEDICAL_EXPENSE_FLOOR_v1.0'));
});

test('medical expense deduction rejects bad input', () => {
  assert.throws(() => medicalExpenseDeduction.calculate({ adjustedGrossIncome:-1, medicalExpenses:1 }, ctx()));
  assert.throws(() => medicalExpenseDeduction.calculate({ adjustedGrossIncome:100000 }, ctx()));
});
