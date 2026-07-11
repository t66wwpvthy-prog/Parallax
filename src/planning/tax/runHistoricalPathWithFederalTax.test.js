import { test } from 'node:test';
import assert from 'node:assert';
import { defaultPlan, resolveInputs, runHistoricalPath } from '../../../engine.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';
import { runHistoricalPathWithFederalTax } from './runHistoricalPathWithFederalTax.js';

test('historical retirement row taxes equal federal Form 1040 line 24', () => {
  const plan = structuredClone(defaultPlan);
  plan.meta.filingStatus = 'single';
  const taxOptions = {
    baseTaxYear: 2026,
    filingStatus: 'single',
    scenarioId: 't6_historical_test',
  };
  const shortcut = runHistoricalPath(plan, 1973, 'taxable-first');
  const federal = runHistoricalPathWithFederalTax(
    plan,
    1973,
    'taxable-first',
    undefined,
    undefined,
    taxOptions
  );
  const resolver = createFederalTaxResolver(resolveInputs(plan, {}), taxOptions);
  const retirementRows = shortcut.rows.filter((row) => row.phase !== 'accum' && row.source !== null);
  const expectedTaxes = retirementRows.map((row) => resolver(row));
  const federalRetirementRows = federal.rows.filter((row) => row.phase !== 'accum' && row.source !== null);

  assert.deepStrictEqual(federalRetirementRows.map((row) => row.taxes), expectedTaxes);
  assert.ok(federalRetirementRows.some((row, index) => row.taxes !== retirementRows[index].taxes),
    'fixture must prove federal tax differs from the shortcut');
  assert.deepStrictEqual(
    federal.rows.map((row) => ({
      withdrawal: row.withdrawal,
      rmd: row.rmd,
      balance: row.balance,
      accountBreakdown: row.accountBreakdown,
      accountBalances: row.accountBalances,
    })),
    shortcut.rows.map((row) => ({
      withdrawal: row.withdrawal,
      rmd: row.rmd,
      balance: row.balance,
      accountBreakdown: row.accountBreakdown,
      accountBalances: row.accountBalances,
    })),
    'federal reporting must not change shortcut funding, gross-up, RMDs, or balances'
  );
  assert.ok(Math.abs(
    federal.lifetimeTax - federalRetirementRows.reduce((sum, row) => sum + row.taxes, 0)
  ) < 0.01);
});
