import { test } from 'node:test';
import assert from 'node:assert';
import { selfEmploymentTax } from './selfEmploymentTax.js';

const ctx = (over = {}) => ({
  calculatedAt: '2026-07-10T12:00:00.000Z',
  runId: 'test_run',
  scenarioId: 'test_schedule_se',
  taxYear: 2025,
  lawVersion: '2025_FINAL',
  ...over,
});

test('annual-08 Schedule SE facts calculate $1,028 of self-employment tax', () => {
  const { result, audit } = selfEmploymentTax.calculate({
    taxpayer: 'spouse',
    netEarningsFromSelfEmployment: 6717,
    socialSecurityWagesAndTips: 6717,
  }, ctx());

  assert.deepStrictEqual(result, {
    remainingSocialSecurityWageBase: 169383,
    socialSecurityTaxableEarnings: 6717,
    socialSecurityTax: 833,
    medicareTax: 195,
    selfEmploymentTax: 1028,
  });
  assert.strictEqual(audit.ruleId, 'FED_SELF_EMPLOYMENT_TAX');
  assert.deepStrictEqual(audit.dataSourcesUsed, ['IRS_2025_SCHEDULE_SE_v1.0']);
  assert.strictEqual(audit.inputsUsed.taxpayer, 'spouse');
});

test('social security wages reduce the remaining wage base', () => {
  const { result } = selfEmploymentTax.calculate({
    netEarningsFromSelfEmployment: 10000,
    socialSecurityWagesAndTips: 170000,
  }, ctx());

  assert.strictEqual(result.remainingSocialSecurityWageBase, 6100);
  assert.strictEqual(result.socialSecurityTaxableEarnings, 6100);
  assert.strictEqual(result.socialSecurityTax, 756);
  assert.strictEqual(result.medicareTax, 290);
  assert.strictEqual(result.selfEmploymentTax, 1046);
});

test('wages at the social security ceiling leave only Medicare tax', () => {
  const { result } = selfEmploymentTax.calculate({
    netEarningsFromSelfEmployment: 10000,
    socialSecurityWagesAndTips: 176100,
  }, ctx());

  assert.strictEqual(result.socialSecurityTax, 0);
  assert.strictEqual(result.medicareTax, 290);
  assert.strictEqual(result.selfEmploymentTax, 290);
});

test('invalid or missing Schedule SE inputs throw', () => {
  assert.throws(() => selfEmploymentTax.calculate({
    netEarningsFromSelfEmployment: -1,
    socialSecurityWagesAndTips: 0,
  }, ctx()));
  assert.throws(() => selfEmploymentTax.calculate({
    netEarningsFromSelfEmployment: 1000,
  }, ctx()));
});

test('unsupported law version does not silently reuse 2025 data', () => {
  assert.throws(() => selfEmploymentTax.calculate({
    netEarningsFromSelfEmployment: 6717,
    socialSecurityWagesAndTips: 6717,
  }, ctx({ taxYear: 2026, lawVersion: '2026_FINAL' })), /No self-employment tax data/);
});
