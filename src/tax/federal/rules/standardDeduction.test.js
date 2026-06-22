import { test } from 'node:test';
import assert from 'node:assert';
import { standardDeduction, meta } from './standardDeduction.js';

const ctx = () => ({
  calculatedAt: '2026-06-21T12:00:00.000Z',
  runId: 'std_ded_test',
  scenarioId: 'std_ded_scenario',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

test('meta contract', () => {
  assert.strictEqual(meta.ruleId, 'FED_STANDARD_DEDUCTION');
  assert.ok(meta.dataSourcesRequired.includes('IRS_2026_STANDARD_DEDUCTION_v1.0'));
});

test('2026 standard deduction by filing status', () => {
  const cases = [
    ['single', 15750],
    ['marriedFilingJointly', 31500],
    ['headOfHousehold', 23625],
    ['marriedFilingSeparately', 15750],
  ];
  for(const [filingStatus, expected] of cases){
    const { result } = standardDeduction.calculate({ filingStatus }, ctx());
    assert.strictEqual(result.standardDeduction, expected, filingStatus);
  }
});

test('audit is serializable and carries the data source', () => {
  const { audit } = standardDeduction.calculate({ filingStatus: 'single' }, ctx());
  assert.doesNotThrow(() => JSON.stringify(audit));
  assert.ok(audit.dataSourcesUsed.includes('IRS_2026_STANDARD_DEDUCTION_v1.0'));
});

test('bad inputs throw', () => {
  assert.throws(() => standardDeduction.calculate({ filingStatus: 'martian' }, ctx()));
  assert.throws(() => standardDeduction.calculate({}, ctx()));
});
