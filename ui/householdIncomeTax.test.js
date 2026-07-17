import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultPlan } from '../engine.js';
import { renderHouseholdIncomeTax } from './householdIncomeTax.js';

function plan(){
  const value = structuredClone(defaultPlan);
  value.meta.filingStatus = 'marriedFilingJointly';
  value.meta.primaryName = 'Client 1';
  value.meta.spouseName = 'Client 2';
  value.household.primary = { currentAge: 64, retirementAge: 67, planEndAge: 95 };
  value.household.spouse = { currentAge: 63, retirementAge: 66, planEndAge: 95 };
  value.income.other = [];
  value.income.socialSecurity = {
    primary: { pia: 0, claimAge: 67 },
    spouse: { pia: 0, claimAge: 67 },
  };
  value.incomeTax = { adjustments: [], deductions: [], credits: [], deductionMode: 'auto' };
  return value;
}

const deps = {
  field: (path, type) => `<input data-path="${path}" data-type="${type}">`,
  incomeTaxSummary: () => ({
    status: 'ready',
    totalIncome: 192800,
    adjustments: 37300,
    adjustedGrossIncome: 155500,
    deductionUsed: 38300,
    deductionMethod: 'Itemized',
    standardDeduction: 31500,
    itemizedDeduction: 38300,
    taxableIncome: 117200,
    marginalRate: 0.22,
    ordinaryBracketRoom: 89500,
    capitalGainsRate: 0.15,
    capitalGainsNote: '0% bracket exceeded by $18,500',
    federalTaxLiability: 15600,
    effectiveRate: 0.133,
    rmdAge: 75,
    firstRmdYear: 2037,
  }),
};

test('default slots match design 2a without persisting empty rows', () => {
  const html = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey: null });
  for(const slot of [
    'wages:client', 'wages:spouse', 'interest:joint', 'dividends:joint',
    'social_security:client', 'social_security:spouse',
    '401k:client', '401k:spouse', 'hsa:joint',
    'medical', 'charitable', 'mortgage_interest', 'salt',
  ]) assert.match(html, new RegExp(`data-income-tax-slot="${slot}"`), slot);

  assert.match(html, /Working years/);
  assert.match(html, /Retirement years/);
  assert.match(html, /PRE-TAX &amp; ADJUSTMENTS/);
  assert.match(html, /Standard · MFJ \+ senior 65\+/);
  assert.match(html, /hh-it-position/);
  assert.match(html, /AGI → MAGI/);
  assert.match(html, /Initial taxable income/);
  assert.doesNotMatch(html, /CREDITS/);
  assert.doesNotMatch(html, /data-income-tax-slot="(?:short|long)_term_capital_gain/);
});

test('income add flow uses ordinary catalog without path capital gains', () => {
  const html = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey: 'income' });
  for(const key of [
    'type', 'owner', 'amount', 'startAge', 'endAge', 'growthPct',
    'interestTreatment', 'qualifiedPct', 'taxablePct', 'netTaxable',
  ]) assert.match(html, new RegExp(`data-hh-draft="${key}"`), key);

  for(const type of [
    'wages', 'bonus', 'self_employment', 'pension', 'annuity', 'rental',
    'interest', 'dividends', 'deferred_comp', 'other',
  ]) assert.match(html, new RegExp(`option value="${type}"`), type);

  assert.doesNotMatch(html, /option value="(?:long|short)_term_capital_gain"/);
  assert.doesNotMatch(html, /option value="social_security"/);
  assert.doesNotMatch(html, /option value="(?:ira_distribution|roth_conversion|tax_exempt_interest)"/);

  const closed = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey: null });
  assert.doesNotMatch(closed, /LT cap gains/);
  assert.doesNotMatch(closed, /external sale/);
});

test('external sale add flow remains available when opened and labels rare brokerage-outside sales', () => {
  const html = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey: 'external-sale' });
  assert.match(html, /outside the modeled brokerage path/);
  assert.match(html, /option value="long_term_capital_gain"/);
  assert.match(html, /option value="short_term_capital_gain"/);
  assert.doesNotMatch(html, /option value="wages"/);
});

test('nonzero optional income and adjustment rows render without becoming defaults', () => {
  const value = plan();
  value.income.other = [{
    typeId: 'long_term_capital_gain', owner: 'joint', label: 'External sale — long-term gain',
    amount: 12000, startAge: 64, endAge: 64, realGrowth: 0, taxablePct: 0,
  }];
  value.incomeTax.adjustments = [{
    typeId: 'ira_deduction', owner: 'client', label: 'Deductible IRA contribution', amount: 7000,
  }];
  const html = renderHouseholdIncomeTax(value, deps, { hhAddingKey: null });
  assert.match(html, /External sale — long-term gain/);
  assert.match(html, /not a taxable-sleeve draw/);
  assert.match(html, /Deductible IRA contribution/);
  assert.match(html, /data-path="income\.other\.0\.amount"/);
});

test('adjustment and deduction add flows expose approved vocabularies', () => {
  const adjustment = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey: 'adjustment' });
  assert.match(adjustment, /data-hh-draft="whileWorkingOnly"/);
  for(const type of ['401k', 'hsa', 'ira_deduction', 'other']){
    assert.match(adjustment, new RegExp(`option value="${type}"`));
  }

  const deduction = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey: 'deduction' });
  for(const type of ['medical', 'charitable', 'mortgage_interest', 'salt', 'other']){
    assert.match(deduction, new RegExp(`option value="${type}"`), type);
  }
  assert.doesNotMatch(deduction, /credit:/);
  assert.doesNotMatch(deduction, /option value="real_estate_tax"/);
});

test('tax position retains all six required reference outputs', () => {
  const html = renderHouseholdIncomeTax(plan(), deps, { hhAddingKey: null });
  for(const label of [
    'Federal marginal bracket', 'Capital gains rate', 'Next IRMAA tier',
    'Senior deduction (65+)', 'Effective tax rate', 'RMDs begin',
  ]) assert.ok(html.includes(label), label);
  assert.match(html, /Requires Medicare threshold rule support/);
  assert.match(html, /\$117,200/);
  assert.match(html, /22%/);
});
