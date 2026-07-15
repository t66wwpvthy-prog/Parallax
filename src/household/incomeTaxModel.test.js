import test from 'node:test';
import assert from 'node:assert/strict';

import { createIncomeTaxInputs, retagIncomeSource } from './incomeTaxModel.js';

const plan = {
  meta: { primaryName:'Client', spouseName:'Co-client' },
  household: {
    primary: { currentAge:60, retirementAge:67 },
    spouse: { currentAge:59, retirementAge:66 },
  },
};

test('new income-tax inputs keep realized gains out of projected income', () => {
  assert.deepEqual(createIncomeTaxInputs(), {
    adjustments: [],
    deductions: [],
    deductionMode: 'auto',
    realizedGains: { shortTerm:0, longTerm:0 },
  });
});

test('retagging an income source preserves cash-flow timing but resets tax defaults', () => {
  const source = {
    typeId:'interest', label:'Interest', owner:'joint', amount:10000,
    startAge:60, endAge:70, realGrowth:.01, taxablePct:0,
  };
  const result = retagIncomeSource(plan, source, 'dividends');
  assert.equal(result.typeId, 'dividends');
  assert.equal(result.label, 'Dividends');
  assert.equal(result.amount, 10000);
  assert.equal(result.startAge, 60);
  assert.equal(result.endAge, 70);
  assert.equal(result.realGrowth, .01);
  assert.equal(result.taxablePct, 1);
  assert.equal(result.qualifiedPct, 0);
});
