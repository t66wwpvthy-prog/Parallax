import test from 'node:test';
import assert from 'node:assert/strict';
import { saltDeductionCap, meta } from './saltDeductionCap.js';

const ctx = () => ({
  calculatedAt: '2026-07-21T12:00:00.000Z',
  runId: 'salt_cap_test',
  scenarioId: 't9_itemized',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

test('SALT deduction cap meta contract', () => {
  assert.equal(meta.ruleId, 'FED_SALT_DEDUCTION_CAP');
  assert.ok(meta.dataSourcesRequired.includes('IRC_164_SALT_CAP_2026_DEMO_v1.0'));
});

test('SALT deduction cap limits MFJ entered taxes to 40000', () => {
  const capped = saltDeductionCap.calculate({
    filingStatus: 'marriedFilingJointly',
    enteredSaltTotal: 44800,
  }, ctx()).result;
  assert.equal(capped.deductibleSalt, 40000);
  assert.equal(capped.disallowedSalt, 4800);

  const belowCap = saltDeductionCap.calculate({
    filingStatus: 'marriedFilingJointly',
    enteredSaltTotal: 30000,
  }, ctx()).result;
  assert.equal(belowCap.deductibleSalt, 30000);
  assert.equal(belowCap.disallowedSalt, 0);
});

test('SALT deduction cap fails closed for unsupported filing status', () => {
  assert.throws(() => saltDeductionCap.calculate({
    filingStatus: 'single',
    enteredSaltTotal: 1000,
  }, ctx()), /No SALT deduction cap/);
});

test('SALT deduction cap audit is serializable and cites the source', () => {
  const { audit } = saltDeductionCap.calculate({
    filingStatus: 'marriedFilingJointly',
    enteredSaltTotal: 44800,
  }, ctx());
  assert.doesNotThrow(() => JSON.stringify(audit));
  assert.ok(audit.dataSourcesUsed.includes('IRC_164_SALT_CAP_2026_DEMO_v1.0'));
});
