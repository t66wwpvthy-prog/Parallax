import { test } from 'node:test';
import assert from 'node:assert';
import {
  defaultPlan,
  generateReturnPath,
  resetSeed,
  runSimulation,
} from '../../../engine.js';
import { attachTypicalPathFederalTax } from './attachTypicalPathFederalTax.js';
import { rerunTypicalPathWithFederalTax } from './rerunTypicalPathWithFederalTax.js';

function fixture(){
  const plan = structuredClone(defaultPlan);
  plan.meta.filingStatus = 'single';
  const horizon = plan.household.primary.planEndAge - plan.household.primary.currentAge;
  resetSeed(20260710);
  const paths = Array.from({ length: 40 }, () => generateReturnPath(horizon));
  const analysis = runSimulation(plan, {}, paths);
  const options = {
    filingStatus: 'single',
    baseTaxYear: 2026,
    scenarioId: 't6_typical_path_test',
  };
  const federalAnalysis = rerunTypicalPathWithFederalTax(analysis, options);
  return { analysis, federalAnalysis, options };
}

function aggregateSnapshot(analysis){
  return {
    successRate: analysis.successRate,
    survived: analysis.survived,
    total: analysis.total,
    terminal: analysis.terminal,
    envelope: analysis.envelope,
    medianCagr: analysis.medianCagr,
    medianLifetimeTax: analysis.medianLifetimeTax,
    metrics: analysis.metrics,
  };
}

test('p50 retirement row taxes equal federal Form 1040 line 24', () => {
  const { federalAnalysis, options } = fixture();
  const summary = attachTypicalPathFederalTax(federalAnalysis, options);

  assert.ok(summary.years.length > 0);
  assert.ok(summary.years.every((year) =>
    Math.abs(year.engineTax - year.federalTaxLiability) < 0.01
  ));
});

test('p50 federal rerun leaves Monte Carlo simulations and aggregates unchanged', () => {
  const { analysis, federalAnalysis } = fixture();

  assert.notStrictEqual(federalAnalysis, analysis);
  assert.notStrictEqual(federalAnalysis.paths.p50, analysis.paths.p50);
  assert.strictEqual(federalAnalysis.paths.p50.simIndex, analysis.paths.p50.simIndex);
  assert.strictEqual(federalAnalysis.paths.p50.returnPath, analysis.paths.p50.returnPath);
  assert.strictEqual(federalAnalysis.sims, analysis.sims);
  for(const key of ['p10', 'p25', 'p75', 'p90']){
    assert.strictEqual(federalAnalysis.paths[key], analysis.paths[key]);
  }
  assert.deepStrictEqual(aggregateSnapshot(federalAnalysis), aggregateSnapshot(analysis));
  assert.deepStrictEqual(
    federalAnalysis.paths.p50.rows.map((row) => ({
      withdrawal: row.withdrawal,
      rmd: row.rmd,
      balance: row.balance,
      accountBreakdown: row.accountBreakdown,
      accountBalances: row.accountBalances,
    })),
    analysis.paths.p50.rows.map((row) => ({
      withdrawal: row.withdrawal,
      rmd: row.rmd,
      balance: row.balance,
      accountBreakdown: row.accountBreakdown,
      accountBalances: row.accountBalances,
    })),
    'federal reporting must not change shortcut funding, gross-up, RMDs, or balances'
  );
});

test('attached federal-vs-path delta is approximately zero after p50 rerun', () => {
  const { analysis, federalAnalysis, options } = fixture();
  const before = attachTypicalPathFederalTax(analysis, options);
  const after = attachTypicalPathFederalTax(federalAnalysis, options);

  assert.ok(Math.abs(before.totals.deltaVsEnginePath) > 0.01,
    'fixture must begin with a real shortcut-vs-federal delta');
  assert.ok(Math.abs(after.totals.deltaVsEnginePath) < 0.01);
});
