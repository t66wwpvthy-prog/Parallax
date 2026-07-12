import { test } from 'node:test';
import assert from 'node:assert';
import { defaultPlan, runSimulation } from '../../../engine.js';
import { promoteTaxFundedProbability } from '../../scenarios/promoteTaxFundedProbability.js';
import { rerunMonteCarloWithFederalTax } from './rerunMonteCarloWithFederalTax.js';
import { runMonteCarloWithFederalFunding } from './runMonteCarloWithFederalFunding.js';

function controlledFixture(){
  const plan = structuredClone(defaultPlan);
  plan.meta.filingStatus = 'single';
  plan.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 66 };
  plan.household.spouse = null;
  plan.portfolio.accounts = {
    taxable: { balance: 0, basisPct: 1 },
    traditional: { balance: 400000 },
    roth: { balance: 0 },
  };
  plan.portfolio.extraAccounts = [];
  plan.income.socialSecurity = { primary: { pia: 0, claimAge: 67 }, spouse: null };
  plan.income.other = [];
  plan.income.pension = { benefitByAge: {}, base: 0, startAge: 65, colaPct: 0 };
  plan.expenses = {
    living: 300000,
    housing: 0,
    debt: 0,
    healthcare: 0,
    healthcareRealGrowth: 0,
    extra: [],
  };
  plan.liabilities = [];
  plan.properties = [];
  plan.goals = [];
  plan.ltc = { amount: 0, onsetAge: 85 };
  plan.simulation.iterations = 40;

  const returnPaths = Array.from(
    { length: 40 },
    () => [{ y: 2025, proxyReturn: 0 }]
  );
  return { plan, returnPaths };
}

function shortcutSnapshot(analysis){
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

test('federalSuccessRate can differ while shortcut MC aggregates remain unchanged', () => {
  const { plan, returnPaths } = controlledFixture();
  const shortcutAnalysis = runSimulation(plan, {}, returnPaths);
  const result = runMonteCarloWithFederalFunding(shortcutAnalysis, plan, {}, {
    filingStatus: 'single',
    baseTaxYear: 2025,
    scenarioId: 't8_federal_success_rate_test',
  });

  assert.deepStrictEqual(shortcutSnapshot(result), shortcutSnapshot(shortcutAnalysis));
  assert.strictEqual(result.successRate, 100, 'controlled shortcut paths must survive');
  assert.strictEqual(result.federalSuccessRate, 0,
    'federal tax funding must deplete the controlled paths');
  assert.notStrictEqual(result.federalSuccessRate, result.successRate);
  assert.strictEqual(result.federalFunding.paths.p50.terminalBalance, 0,
    'sidecar must retain the federally funded depletion path');
  assert.ok(shortcutAnalysis.paths.p50.terminalBalance > 0,
    'controlled shortcut path must remain funded before the federal delta');
  assert.strictEqual(result.federalFunding.successRate, result.federalSuccessRate);
  assert.deepStrictEqual(Object.keys(result.federalFunding.paths), [
    'p10', 'p25', 'p50', 'p75', 'p90',
  ]);
  for(const pathKey of Object.keys(result.federalFunding.paths)){
    assert.strictEqual(
      result.federalFunding.paths[pathKey].simIndex,
      shortcutAnalysis.paths[pathKey].simIndex,
      `${pathKey} must preserve the shortcut-selected market path`
    );
  }
  assert.strictEqual(shortcutAnalysis.federalSuccessRate, undefined,
    'sidecar attachment must not mutate the shortcut analysis');
  assert.strictEqual(shortcutAnalysis.federalFunding, undefined,
    'sidecar attachment must not mutate the shortcut analysis');
});

test('federal funding sidecar survives probability promotion and reporting-only reruns', () => {
  const { plan, returnPaths } = controlledFixture();
  const shortcutAnalysis = runSimulation(plan, {}, returnPaths);
  const options = {
    filingStatus: 'single',
    baseTaxYear: 2025,
    scenarioId: 'phase_3_composition_test',
  };
  const funded = runMonteCarloWithFederalFunding(shortcutAnalysis, plan, {}, options);
  const promoted = promoteTaxFundedProbability(funded);
  const reported = rerunMonteCarloWithFederalTax(promoted, options);

  assert.strictEqual(promoted.federalFunding, funded.federalFunding);
  assert.strictEqual(reported.federalFunding, funded.federalFunding);
  assert.strictEqual(reported.successRate, funded.federalSuccessRate);
});
