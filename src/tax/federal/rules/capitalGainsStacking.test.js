import { test } from 'node:test';
import assert from 'node:assert';
import { capitalGainsStacking, meta } from './capitalGainsStacking.js';

const ctx = () => ({
  calculatedAt: '2026-06-21T12:00:00.000Z',
  runId: 'cg_test',
  scenarioId: 'cg_scenario',
  taxYear: 2026,
  lawVersion: '2026_FINAL',
});

test('preferential income inside the 0% band produces no capital gains tax', () => {
  const { result } = capitalGainsStacking.calculate({
    filingStatus: 'single',
    ordinaryTaxableIncome: 48000,
    netLongTermCapitalGains: 1000,
    qualifiedDividends: 0,
  }, ctx());
  assert.strictEqual(result.preferentialIncomeTax, 0);
});

test('single filer straddles the 0% and 15% capital gains bands', () => {
  const { result } = capitalGainsStacking.calculate({
    filingStatus: 'single',
    ordinaryTaxableIncome: 49000,
    netLongTermCapitalGains: 1000,
    qualifiedDividends: 0,
  }, ctx());
  assert.strictEqual(result.preferentialIncomeTax, 82.50);
});

test('single filer straddles the 15% and 20% capital gains bands', () => {
  const { result } = capitalGainsStacking.calculate({
    filingStatus: 'single',
    ordinaryTaxableIncome: 540000,
    netLongTermCapitalGains: 20000,
    qualifiedDividends: 0,
  }, ctx());
  assert.strictEqual(result.preferentialIncomeTax, 3725);
});

test('ordinary income above the 20% threshold puts all preferred income at 20%', () => {
  const { result } = capitalGainsStacking.calculate({
    filingStatus: 'single',
    ordinaryTaxableIncome: 600000,
    netLongTermCapitalGains: 5000,
    qualifiedDividends: 0,
  }, ctx());
  assert.strictEqual(result.preferentialIncomeTax, 1000);
  assert.strictEqual(result.marginalPreferentialRate, 0.20);
});

test('audit is serializable and carries the data source', () => {
  const { audit } = capitalGainsStacking.calculate({
    filingStatus: 'single',
    ordinaryTaxableIncome: 49000,
    netLongTermCapitalGains: 1000,
    qualifiedDividends: 0,
  }, ctx());
  assert.doesNotThrow(() => JSON.stringify(audit));
  assert.ok(audit.dataSourcesUsed.includes('IRS_2026_CAPITAL_GAINS_RATES_v1.0'));
  assert.strictEqual(meta.ruleId, 'FED_CAPITAL_GAINS_STACKING');
});

test('bad capital gains inputs throw', () => {
  assert.throws(() => capitalGainsStacking.calculate({
    filingStatus: 'single',
    ordinaryTaxableIncome: -1,
    netLongTermCapitalGains: 0,
    qualifiedDividends: 0,
  }, ctx()));
});
