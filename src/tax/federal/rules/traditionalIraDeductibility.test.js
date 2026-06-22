import { test } from 'node:test';
import assert from 'node:assert';
import { traditionalIraDeductibility } from './traditionalIraDeductibility.js';

const ctx = () => ({
  calculatedAt: '2026-06-21T12:00:00.000Z',
  runId: 'ira_test',
  scenarioId: 'ira_scenario',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

test('not covered by a workplace plan receives the full allowable deduction', () => {
  const { result } = traditionalIraDeductibility.calculate({
    filingStatus: 'single',
    modifiedAgi: 50000,
    contributionAmount: 7500,
    age: 40,
    taxableCompensation: 80000,
    taxpayerCoveredByWorkplacePlan: false,
    spouseCoveredByWorkplacePlan: false,
    livedWithSpouse: false,
  }, ctx());
  assert.strictEqual(result.deductibleContribution, 7500);
});

test('single active participant gets full, partial, and no deduction across the phaseout', () => {
  const full = traditionalIraDeductibility.calculate({
    filingStatus: 'single', modifiedAgi: 80000, contributionAmount: 7500, age: 40,
    taxableCompensation: 100000, taxpayerCoveredByWorkplacePlan: true,
    spouseCoveredByWorkplacePlan: false, livedWithSpouse: false,
  }, ctx());
  assert.strictEqual(full.result.deductibleContribution, 7500);

  const partial = traditionalIraDeductibility.calculate({
    filingStatus: 'single', modifiedAgi: 86000, contributionAmount: 7500, age: 40,
    taxableCompensation: 100000, taxpayerCoveredByWorkplacePlan: true,
    spouseCoveredByWorkplacePlan: false, livedWithSpouse: false,
  }, ctx());
  assert.ok(partial.result.deductibleContribution > 0 && partial.result.deductibleContribution < 7500);

  const none = traditionalIraDeductibility.calculate({
    filingStatus: 'single', modifiedAgi: 95000, contributionAmount: 7500, age: 40,
    taxableCompensation: 100000, taxpayerCoveredByWorkplacePlan: true,
    spouseCoveredByWorkplacePlan: false, livedWithSpouse: false,
  }, ctx());
  assert.strictEqual(none.result.deductibleContribution, 0);
});

test('MFJ active participant phaseout uses the wider 2026 range and rounds up to $10', () => {
  const { result } = traditionalIraDeductibility.calculate({
    filingStatus: 'marriedFilingJointly',
    modifiedAgi: 130000,
    contributionAmount: 7500,
    age: 40,
    taxableCompensation: 100000,
    taxpayerCoveredByWorkplacePlan: true,
    spouseCoveredByWorkplacePlan: false,
    livedWithSpouse: true,
  }, ctx());
  assert.strictEqual(result.deductibleContribution, 7130);
});

test('age 50 catch-up increases the deduction limit before phaseout', () => {
  const { result } = traditionalIraDeductibility.calculate({
    filingStatus: 'single',
    modifiedAgi: 50000,
    contributionAmount: 8600,
    age: 55,
    taxableCompensation: 100000,
    taxpayerCoveredByWorkplacePlan: false,
    spouseCoveredByWorkplacePlan: false,
    livedWithSpouse: false,
  }, ctx());
  assert.strictEqual(result.deductibleContribution, 8600);
});

test('allowable deduction is capped by compensation and tracks excess contribution separately', () => {
  const { result } = traditionalIraDeductibility.calculate({
    filingStatus: 'single',
    modifiedAgi: 50000,
    contributionAmount: 10000,
    age: 40,
    taxableCompensation: 5000,
    taxpayerCoveredByWorkplacePlan: false,
    spouseCoveredByWorkplacePlan: false,
    livedWithSpouse: false,
  }, ctx());
  assert.strictEqual(result.allowableContribution, 5000);
  assert.strictEqual(result.excessContribution, 5000);
});

test('audit is serializable and carries the data source', () => {
  const { audit } = traditionalIraDeductibility.calculate({
    filingStatus: 'single', modifiedAgi: 50000, contributionAmount: 7500, age: 40,
    taxableCompensation: 80000, taxpayerCoveredByWorkplacePlan: false,
    spouseCoveredByWorkplacePlan: false, livedWithSpouse: false,
  }, ctx());
  assert.doesNotThrow(() => JSON.stringify(audit));
  assert.ok(audit.dataSourcesUsed.includes('IRS_2026_IRA_LIMITS_v1.0'));
});

test('bad IRA inputs throw', () => {
  assert.throws(() => traditionalIraDeductibility.calculate({
    filingStatus: 'single', modifiedAgi: -1, contributionAmount: 7500, age: 40,
    taxableCompensation: 80000, taxpayerCoveredByWorkplacePlan: false,
    spouseCoveredByWorkplacePlan: false, livedWithSpouse: false,
  }, ctx()));
});
