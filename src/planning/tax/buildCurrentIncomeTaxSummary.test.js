import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurrentIncomeTaxSummary } from './buildCurrentIncomeTaxSummary.js';

function plan(overrides = {}){
  return {
    meta: { filingStatus: 'single' },
    household: { primary: { currentAge: 50, retirementAge: 65, planEndAge: 95 } },
    income: {
      other: [{ typeId:'wages', owner:'client', label:'Wages', amount:100000, startAge:50, endAge:64, realGrowth:0, taxablePct:1 }],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
    incomeTax: { adjustments: [], deductions: [] },
    ...overrides,
  };
}

test('current wizard summary runs the federal engine for supported income', () => {
  const summary = buildCurrentIncomeTaxSummary(plan());
  assert.equal(summary.status, 'ready');
  assert.equal(summary.totalIncome, 100000);
  assert.ok(summary.adjustedGrossIncome > 0);
  assert.ok(summary.federalTaxLiability > 0);
});

test('active Social Security uses the taxable-benefits worksheet, including tax-exempt interest', () => {
  const summary = buildCurrentIncomeTaxSummary(plan({
    household: { primary: { currentAge: 70, retirementAge: 65, planEndAge: 95 } },
    income: {
      other: [{ typeId:'interest', owner:'client', label:'Municipal interest', amount:20000, startAge:50, endAge:999, realGrowth:0, taxablePct:0 }],
      socialSecurity: { primary: { pia:30000, claimAge:67 } },
    },
  }));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.totalIncome, 50000);
  assert.ok(summary.adjustedGrossIncome > 0, 'tax-exempt interest should make part of Social Security taxable');
  assert.ok(summary.adjustedGrossIncome < summary.totalIncome);
});

test('unsupported deduction and self-employment facts fail closed instead of fabricating tax', () => {
  const medical = buildCurrentIncomeTaxSummary(plan({
    incomeTax: { adjustments: [], deductions: [{ typeId:'medical', amount:5000 }] },
  }));
  assert.equal(medical.status, 'needs_facts');
  assert.match(medical.message, /AGI-floor/);
  assert.equal(medical.adjustedGrossIncome, undefined);

  const selfEmployment = buildCurrentIncomeTaxSummary(plan({
    income: {
      other: [{ typeId:'self_employment', owner:'client', label:'Consulting', amount:50000, startAge:50, endAge:64, realGrowth:0, taxablePct:1 }],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
  }));
  assert.equal(selfEmployment.status, 'needs_facts');
  assert.match(selfEmployment.message, /Schedule SE/);
  assert.equal(selfEmployment.federalTaxLiability, undefined);
});

test('current summary maps rental net income and long-term gains to the supported tax spine', () => {
  const summary = buildCurrentIncomeTaxSummary(plan({
    income: {
      other: [
        { typeId:'rental', owner:'client', label:'Rental', amount:40000, netTaxable:15000, startAge:50, endAge:999 },
        { typeId:'long_term_capital_gains', owner:'joint', label:'LTCG', amount:10000, startAge:50, endAge:999 },
      ],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
  }));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.totalIncome, 25000);
  assert.equal(summary.capitalGainsRate, 0);
  assert.ok(summary.capitalGainsCaption.includes('0%'));
  assert.ok(summary.ordinaryBracketRoom > 0);
});

test('current-year realized gains affect tax without becoming projected income rows', () => {
  const value = plan({
    incomeTax: {
      adjustments: [], deductions: [],
      realizedGains: { shortTerm:5000, longTerm:20000 },
    },
  });
  const beforeRows = structuredClone(value.income.other);
  const summary = buildCurrentIncomeTaxSummary(value);
  assert.equal(summary.status, 'ready');
  assert.equal(summary.totalIncome, 125000);
  assert.notEqual(summary.capitalGainsRate, null);
  assert.deepEqual(value.income.other, beforeRows, 'tax-only gains must not create projection rows');
});
