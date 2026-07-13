import { test } from 'node:test';
import assert from 'node:assert';
import { defaultPlan, resolveInputs, runHistoricalPath } from '../../../engine.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';
import { runHistoricalPathWithFederalTax } from './runHistoricalPathWithFederalTax.js';

test('historical path funds and reports federal Form 1040 line 24 coherently', () => {
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
  const federalRetirementRows = federal.rows.filter((row) => row.phase !== 'accum' && row.source !== null);

  for(const [index, row] of federal.rows.entries()){
    if(row.source === null){
      assert.strictEqual(row.taxes, 0);
      continue;
    }
    assert.ok(Math.abs(row.taxes - resolver(row)) < 0.01,
      `historical row ${index} must resolve tax from its final funded facts`);
    if(row.phase !== 'accum'){
      assert.strictEqual(row.taxFundingConvergence?.status, 'converged');
      assert.ok(
        Math.abs(row.taxFundingConvergence.residual)
          <= row.taxFundingConvergence.tolerance
      );
    }
  }
  assert.ok(federalRetirementRows.some((row, index) =>
    row.taxes !== shortcut.rows.filter(
      (candidate) => candidate.phase !== 'accum' && candidate.source !== null
    )[index]?.taxes
  ),
    'fixture must prove federal tax differs from the shortcut');
  assert.notDeepStrictEqual(
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
    'converged federal tax must be allowed to change funding and balances'
  );
  federal.rows.forEach((row, index) => {
    const shortcutRow = shortcut.rows[index];
    if(row.source !== null && shortcutRow.source !== null){
      assert.strictEqual(row.source, shortcutRow.source);
      assert.strictEqual(row.returnRate, shortcutRow.returnRate);
    }
  });
  assert.ok(Math.abs(
    federal.lifetimeTax - federal.rows.reduce((sum, row) => sum + row.taxes, 0)
  ) < 0.01);
});
