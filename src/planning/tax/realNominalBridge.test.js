import test from 'node:test';
import assert from 'node:assert/strict';

import { LONGRUN_INFLATION, defaultPlan, runHistoricalPath, resolveInputs } from '../../../engine.js';
import { rulesLedger } from '../../tax/core/rulesLedger.js';
import {
  BRIDGE_INFLATION,
  inflationFactor,
  projectionLagYears,
  realTaxFromNominalRate,
  toNominal,
  toReal,
} from './realNominalBridge.js';

test('bridge inflation matches engine LONGRUN_INFLATION', () => {
  assert.equal(BRIDGE_INFLATION, LONGRUN_INFLATION);
});

test('inflate then deflate restores real dollars', () => {
  const real = 100_000;
  const lag = 10;
  const nominal = toNominal(real, lag);
  assert.ok(Math.abs(nominal - real * Math.pow(1.025, 10)) < 1e-9);
  assert.ok(Math.abs(toReal(nominal, lag) - real) < 1e-9);
});

test('projectionLagYears is non-negative calendar distance', () => {
  assert.equal(projectionLagYears(2026, 2026), 0);
  assert.equal(projectionLagYears(2026, 2036), 10);
  assert.equal(projectionLagYears(2030, 2026), 0);
});

test('pure-rate tax round-trips so progressive brackets are why the bridge matters', () => {
  const realWage = 80_000;
  const rate = 0.22;
  const viaBridge = realTaxFromNominalRate(realWage, 12, rate);
  assert.ok(Math.abs(viaBridge - realWage * rate) < 1e-9,
    'flat rate: inflate/deflate cancel — real tax = rate × real base');
  // Progressive cliffs do not cancel: same real wage crosses a higher nominal bracket.
  const factor = inflationFactor(20);
  const nominalWage = realWage * factor;
  assert.ok(nominalWage > 120_000, 'lag pushes wages into higher nominal territory');
});

test('IRMAA is not registered as a federal rule yet', () => {
  const ids = rulesLedger.map(rule => rule.meta?.ruleId).filter(Boolean);
  assert.equal(ids.some(id => /irmaa/i.test(id)), false);
});

test('entered long-term capital gain income adds cash without shrinking taxable basis via withdrawal', () => {
  const base = structuredClone(defaultPlan);
  base.meta = { ...(base.meta || {}), asOfYear: 2026 };
  base.household.primary = { currentAge: 70, retirementAge: 70, planEndAge: 75 };
  base.portfolio.accounts = {
    taxable: { balance: 500_000, basisPct: 1 },
    traditional: { balance: 0 },
    roth: { balance: 0 },
  };
  base.income.socialSecurity = { primary: { pia: 0, claimAge: 70 }, spouse: null };
  base.income.pension = { benefitByAge: {}, base: 0, startAge: 99, colaPct: 0 };
  base.income.other = [];
  base.expenses = { living: 40_000, housing: 0, debt: 0, healthcare: 0, healthcareRealGrowth: 0, extra: [] };
  base.goals = [];
  base.liabilities = [];
  base.properties = [];
  base.ltc = { amount: 0, onsetAge: 99 };

  const without = runHistoricalPath(base, 1995, 'taxable-first');
  const withGain = structuredClone(base);
  withGain.income.other = [{
    typeId: 'long_term_capital_gain',
    label: 'External LTCG',
    amount: 40_000,
    startAge: 70,
    endAge: 70,
    taxablePct: 0,
    realGrowth: 0,
  }];
  const withRow = runHistoricalPath(withGain, 1995, 'taxable-first');
  const age70Base = without.rows.find(r => r.age === 70);
  const age70Gain = withRow.rows.find(r => r.age === 70);
  assert.equal(age70Gain.otherIncome, 40_000);
  assert.ok(age70Gain.withdrawal < age70Base.withdrawal - 1,
    'external capital-gain income reduces the withdrawal gap');
  assert.ok((age70Gain.taxableCapitalGain || 0) <= (age70Base.taxableCapitalGain || 0) + 0.01,
    'entered LTCG income must not invent extra portfolio withdrawal gains');
});

test('taxableCapitalGain requires a taxable withdrawal (portfolio realization path)', () => {
  const p = structuredClone(defaultPlan);
  p.meta = { ...(p.meta || {}), asOfYear: 2026 };
  p.household.primary = { currentAge: 70, retirementAge: 70, planEndAge: 72 };
  p.portfolio.accounts = {
    taxable: { balance: 400_000, basisPct: 0.5 },
    traditional: { balance: 0 },
    roth: { balance: 0 },
  };
  p.income.other = [];
  p.income.socialSecurity = { primary: { pia: 0, claimAge: 70 }, spouse: null };
  p.expenses = { living: 50_000, housing: 0, debt: 0, healthcare: 0, healthcareRealGrowth: 0, extra: [] };
  p.goals = [];
  const row = runHistoricalPath(p, 1995, 'taxable-first').rows.find(r => r.age === 70);
  assert.ok(row.withdrawal > 0);
  assert.ok(row.accountBreakdown.taxable > 0);
  assert.ok(row.taxableCapitalGain > 0);
  assert.ok(row.taxableCapitalGain <= row.accountBreakdown.taxable + 0.01);
});

test('federal path still receives real cash without inflate bridge (current ≈ target gap)', () => {
  // Contract pin: until the adapter calls toNominal/toReal, lag does not change
  // the dollars handed to tax. resolveInputs exposes asOfYear; row cash stays real.
  const p = structuredClone(defaultPlan);
  p.meta = { ...(p.meta || {}), asOfYear: 2026, filingStatus: 'single' };
  p.household.primary = { currentAge: 65, retirementAge: 65, planEndAge: 67 };
  const params = resolveInputs(p, {});
  assert.equal(params.asOfYear, 2026);
  const lag = projectionLagYears(params.asOfYear, 2036);
  assert.equal(lag, 10);
  assert.ok(Math.abs(toNominal(100_000, lag) - 100_000) > 1,
    'bridge would change dollars at lag 10 — federal wiring still pending');
});
