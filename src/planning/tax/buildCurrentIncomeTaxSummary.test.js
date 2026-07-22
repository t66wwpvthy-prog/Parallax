import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurrentIncomeTaxSummary } from './buildCurrentIncomeTaxSummary.js';

function plan(overrides = {}){
  return {
    meta: { filingStatus: 'single' },
    household: { primary: { birthYear: 1976, currentAge: 50, retirementAge: 65, planEndAge: 95 } },
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
  assert.ok(summary.ordinaryBracketRoom > 0);
  assert.equal(summary.rmdAge, 75);
  assert.equal(summary.firstRmdYear, 2051);
});

test('qualified dividends expose the audited capital-gains position', () => {
  const summary = buildCurrentIncomeTaxSummary(plan({
    income: {
      other: [{ typeId:'dividends', owner:'client', label:'Dividends', amount:30000, startAge:50, endAge:999, realGrowth:0, qualifiedPct:1 }],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
  }));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.capitalGainsRate, 0);
  assert.ok(summary.capitalGainsRoom > 0);
  assert.match(summary.capitalGainsNote, /0% bracket/);
});

test('a working-only 401(k) contribution no longer reduces AGI after retirement', () => {
  const summary = buildCurrentIncomeTaxSummary(plan({
    household: { primary: { birthYear: 1956, currentAge: 70, retirementAge: 65, planEndAge: 95 } },
    income: {
      other: [{ typeId:'pension', owner:'client', label:'Pension', amount:60000, startAge:65, endAge:999, realGrowth:0, taxablePct:1 }],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
    incomeTax: {
      adjustments: [{ typeId:'401k', owner:'client', amount:23000, whileWorkingOnly:true }],
      deductions: [],
    },
  }));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.adjustments, 0);
  assert.equal(summary.adjustedGrossIncome, 60000);
});

test('current-year federal items route through existing 1040 inputs and Premium Tax Credit reduces line 24', () => {
  const income = {
    other: [
      { typeId:'wages', owner:'client', label:'Wages', amount:100000, startAge:50, endAge:64, taxablePct:1 },
      { typeId:'tax_exempt_interest', owner:'joint', label:'Tax-exempt interest', amount:5000, startAge:50, endAge:50, taxablePct:0 },
      { typeId:'ira_distribution', owner:'client', label:'IRA distribution', amount:10000, startAge:50, endAge:50, taxablePct:.8 },
      { typeId:'roth_conversion', owner:'client', label:'Roth conversion', amount:20000, startAge:50, endAge:50, taxablePct:.9 },
      { typeId:'short_term_capital_gain', owner:'joint', label:'Short-term gain', amount:5000, startAge:50, endAge:50, taxablePct:1 },
      { typeId:'long_term_capital_gain', owner:'joint', label:'Long-term gain', amount:15000, startAge:50, endAge:50, taxablePct:0 },
    ],
    socialSecurity: { primary: { pia:0, claimAge:67 } },
  };
  const withoutCredit = buildCurrentIncomeTaxSummary(plan({ income }));
  const withCredit = buildCurrentIncomeTaxSummary(plan({
    income,
    incomeTax: {
      adjustments: [],
      deductions: [],
      credits: [{ typeId:'premium_tax_credit', amount:2000 }],
    },
  }));
  assert.equal(withCredit.status, 'ready');
  assert.equal(withCredit.totalIncome, 155000);
  assert.equal(withCredit.adjustedGrossIncome, 146000);
  assert.equal(withCredit.premiumTaxCredit, 2000);
  assert.equal(withoutCredit.federalTaxLiability - withCredit.federalTaxLiability, 2000);
  assert.equal(withCredit.capitalGainsRate, .15);
  assert.match(withCredit.capitalGainsNote, /0% bracket exceeded/);
});

test('deductible IRA and unsupported SALT filing statuses still fail closed', () => {
  const ira = buildCurrentIncomeTaxSummary(plan({
    incomeTax: {
      adjustments: [{ typeId:'ira_deduction', owner:'client', amount:7000 }],
      deductions: [],
      credits: [],
    },
  }));
  assert.equal(ira.status, 'needs_facts');
  assert.match(ira.message, /workplace-plan facts/);

  for(const typeId of ['real_estate_tax', 'personal_property_tax']){
    const propertyTax = buildCurrentIncomeTaxSummary(plan({
      incomeTax: {
        adjustments: [],
        deductions: [{ typeId, amount:5000 }],
        credits: [],
      },
    }));
    assert.equal(propertyTax.status, 'needs_facts');
    assert.match(propertyTax.message, /married filing jointly only/);
  }
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

test('medical deduction applies the federal AGI floor', () => {
  const summary = buildCurrentIncomeTaxSummary(plan({
    incomeTax: {
      adjustments: [],
      deductions: [{ typeId:'medical', amount:10000 }],
      credits: [],
    },
  }));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.adjustedGrossIncome, 100000);
  assert.equal(summary.itemizedEnteredAmount, 10000);
  assert.equal(summary.itemizedDeductionBreakdown.medical.floorAmount, 7500);
  assert.equal(summary.itemizedDeductionBreakdown.medical.appliedAmount, 2500);
  assert.equal(summary.itemizedDeduction, 2500);
  assert.equal(summary.deductionMethod, 'Standard');
});

test('MFJ SALT rows roll up and apply one 40000 cap', () => {
  const summary = buildCurrentIncomeTaxSummary(plan({
    meta: { filingStatus:'marriedFilingJointly' },
    incomeTax: {
      adjustments: [],
      deductions: [
        { typeId:'salt', amount:20000 },
        { typeId:'real_estate_tax', amount:18000 },
        { typeId:'personal_property_tax', amount:6800 },
      ],
      credits: [],
    },
  }));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.itemizedDeductionBreakdown.salt.enteredAmount, 44800);
  assert.equal(summary.itemizedDeductionBreakdown.salt.appliedAmount, 40000);
  assert.equal(summary.itemizedDeduction, 40000);
  assert.equal(summary.deductionMethod, 'Itemized');
});

test('filled T9 demo reconciles AGI and itemized total', () => {
  const summary = buildCurrentIncomeTaxSummary(plan({
    meta: { filingStatus:'marriedFilingJointly' },
    income: {
      other: [{ typeId:'wages', owner:'joint', label:'Wages', amount:413000, startAge:50, endAge:64, taxablePct:1 }],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
    incomeTax: {
      adjustments: [{ typeId:'other', owner:'joint', amount:41750 }],
      deductions: [
        { typeId:'medical', amount:8000 },
        { typeId:'charitable', amount:12000 },
        { typeId:'mortgage_interest', amount:18400 },
        { typeId:'salt', amount:44800 },
      ],
      credits: [],
    },
  }));

  assert.equal(summary.status, 'ready');
  assert.equal(summary.totalIncome, 413000);
  assert.equal(summary.adjustments, 41750);
  assert.equal(summary.adjustedGrossIncome, 371250);
  assert.equal(summary.itemizedEnteredAmount, 83200);
  assert.equal(summary.itemizedDeductionBreakdown.medical.appliedAmount, 0);
  assert.equal(summary.itemizedDeductionBreakdown.salt.appliedAmount, 40000);
  assert.equal(summary.itemizedDeduction, 70400);
  assert.equal(summary.deductionMethod, 'Itemized');
  assert.deepEqual(summary.itemizedDeductionAudits.map(audit => audit.ruleId), [
    'FED_MEDICAL_EXPENSE_DEDUCTION',
    'FED_SALT_DEDUCTION_CAP',
  ]);
});

test('self-employment facts fail closed instead of fabricating tax', () => {
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

test('exact duplicate GPC salary rows fail closed while separate pensions remain additive', () => {
  const wage = {
    typeId:'wages', owner:'client', label:'Wages or salary', amount:100000,
    startAge:50, endAge:64, realGrowth:0, taxablePct:1,
  };
  const duplicate = buildCurrentIncomeTaxSummary(plan({
    income: {
      other: [wage, { ...wage }],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
  }));
  assert.equal(duplicate.status, 'needs_facts');
  assert.equal(duplicate.totalIncome, null);
  assert.match(duplicate.message, /duplicate salary/i);
  assert.deepEqual(duplicate.duplicateIncomeRows.map(row => row.duplicateIndex), [1]);

  const pensions = buildCurrentIncomeTaxSummary(plan({
    household: { primary: { birthYear:1956, currentAge:70, retirementAge:65, planEndAge:95 } },
    income: {
      other: [
        { typeId:'pension', owner:'client', label:'Pension A', amount:22000, startAge:65, endAge:999, realGrowth:0, taxablePct:1 },
        { typeId:'pension', owner:'client', label:'Pension B', amount:14000, startAge:67, endAge:999, realGrowth:0, taxablePct:1 },
      ],
      socialSecurity: { primary: { pia:0, claimAge:67 } },
    },
  }));
  assert.equal(pensions.status, 'ready');
  assert.equal(pensions.totalIncome, 36000);
});
