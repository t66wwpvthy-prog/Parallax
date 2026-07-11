import { test } from 'node:test';
import assert from 'node:assert';
import {
  defaultPlan,
  generateReturnPath,
  resetSeed,
  runSimulation,
} from '../../../engine.js';
import { attachPathFederalTax } from './attachTypicalPathFederalTax.js';
import { createFederalTaxResolver } from './createFederalTaxResolver.js';
import { rerunMonteCarloWithFederalTax } from './rerunMonteCarloWithFederalTax.js';

const PATH_KEYS = ['p10', 'p25', 'p50', 'p75', 'p90'];

function fixture(){
  const plan = structuredClone(defaultPlan);
  plan.meta.filingStatus = 'single';
  const horizon = plan.household.primary.planEndAge - plan.household.primary.currentAge;
  resetSeed(20260711);
  const returnPaths = Array.from({ length: 40 }, () => generateReturnPath(horizon));
  const analysis = runSimulation(plan, {}, returnPaths);
  const options = {
    filingStatus: 'single',
    baseTaxYear: 2026,
    scenarioId: 't7_monte_carlo_test',
  };
  const federalAnalysis = rerunMonteCarloWithFederalTax(analysis, options);
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

function fundingSnapshot(sim){
  return sim.rows.map((row) => ({
    withdrawal: row.withdrawal,
    rmd: row.rmd,
    balance: row.balance,
    accountBreakdown: row.accountBreakdown,
    accountBalances: row.accountBalances,
  }));
}

test('all 40 Monte Carlo sims report federal Form 1040 line 24 as retirement row tax', () => {
  const { analysis, federalAnalysis, options } = fixture();
  const resolveFederalTax = createFederalTaxResolver(analysis.params, options);

  assert.strictEqual(federalAnalysis.sims.length, 40);
  for(let index = 0; index < analysis.sims.length; index++){
    const shortcutSim = analysis.sims[index];
    const federalSim = federalAnalysis.sims[index];
    assert.notStrictEqual(federalSim, shortcutSim);
    assert.strictEqual(federalSim.simIndex, shortcutSim.simIndex);
    assert.strictEqual(federalSim.returnPath, shortcutSim.returnPath);

    for(let rowIndex = 0; rowIndex < shortcutSim.rows.length; rowIndex++){
      const shortcutRow = shortcutSim.rows[rowIndex];
      const federalRow = federalSim.rows[rowIndex];
      if(shortcutRow.phase === 'accum' || shortcutRow.source == null){
        assert.strictEqual(federalRow.taxes, shortcutRow.taxes);
        continue;
      }
      const expectedLine24 = resolveFederalTax(shortcutRow);
      assert.ok(
        Math.abs(federalRow.taxes - expectedLine24) < 0.01,
        `sim ${shortcutSim.simIndex} row ${rowIndex} must report federal line 24`
      );
    }
  }
});

test('full-MC rerun patches all percentile paths and preserves shortcut aggregates and funding', () => {
  const { analysis, federalAnalysis } = fixture();

  assert.notStrictEqual(federalAnalysis, analysis);
  assert.notStrictEqual(federalAnalysis.sims, analysis.sims);
  assert.deepStrictEqual(aggregateSnapshot(federalAnalysis), aggregateSnapshot(analysis));

  for(const pathKey of PATH_KEYS){
    const shortcutPath = analysis.paths[pathKey];
    const federalPath = federalAnalysis.paths[pathKey];
    assert.notStrictEqual(federalPath, shortcutPath);
    assert.strictEqual(federalPath.simIndex, shortcutPath.simIndex);
    assert.strictEqual(federalPath.returnPath, shortcutPath.returnPath);
    assert.strictEqual(
      federalPath,
      federalAnalysis.sims.find((sim) =>
        sim.simIndex === shortcutPath.simIndex && sim.returnPath === shortcutPath.returnPath
      )
    );
  }

  for(let index = 0; index < analysis.sims.length; index++){
    assert.deepStrictEqual(
      fundingSnapshot(federalAnalysis.sims[index]),
      fundingSnapshot(analysis.sims[index]),
      `sim ${index} federal reporting must not change shortcut funding or balances`
    );
  }
});

test('federalMedianLifetimeTax is separate while attached story-path deltas stay near zero', () => {
  const { analysis, federalAnalysis, options } = fixture();
  const federalLifetimeTaxes = federalAnalysis.sims
    .map((sim) => sim.lifetimeTax)
    .sort((a, b) => a - b);
  const expectedMedian = federalLifetimeTaxes[Math.floor(federalLifetimeTaxes.length * 0.50)];

  assert.strictEqual(federalAnalysis.medianLifetimeTax, analysis.medianLifetimeTax);
  assert.strictEqual(federalAnalysis.federalMedianLifetimeTax, expectedMedian);
  assert.ok(Number.isFinite(federalAnalysis.federalMedianLifetimeTax));
  for(const pathKey of ['p10', 'p50', 'p90']){
    const summary = attachPathFederalTax(federalAnalysis, pathKey, options);
    assert.ok(Math.abs(summary.totals.deltaVsEnginePath) < 0.01);
  }
});

test('duplicate simIndex and returnPath pairs are rerun once and reused', () => {
  const { analysis, options } = fixture();
  const repeated = analysis.sims[0];
  const duplicateAnalysis = {
    ...analysis,
    sims: [repeated, repeated],
    paths: Object.fromEntries(PATH_KEYS.map((pathKey) => [pathKey, repeated])),
  };
  const federalAnalysis = rerunMonteCarloWithFederalTax(duplicateAnalysis, options);

  assert.strictEqual(federalAnalysis.sims[0], federalAnalysis.sims[1]);
  for(const pathKey of PATH_KEYS){
    assert.strictEqual(federalAnalysis.paths[pathKey], federalAnalysis.sims[0]);
  }
});
